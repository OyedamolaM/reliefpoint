create table public.manual_payments (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 order_id uuid not null unique references public.orders,
 actor uuid not null references auth.users,
 method text not null check(method in ('cash','bank_transfer')),
 amount bigint not null check(amount>0),
 reference text not null check(length(trim(reference)) between 3 and 120),
 note text not null default '' check(length(note)<=1000),
 created_at timestamptz not null default now()
);
create unique index manual_payment_receipts on public.manual_payments(method,lower(trim(reference)));
alter table public.manual_payments enable row level security;
revoke all on public.manual_payments from public,anon,authenticated;
grant select,insert on public.manual_payments to service_role;

create function public.record_manual_payment(p_actor uuid,p_order uuid,p_request uuid,p_method text,p_amount bigint,p_reference text,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; receipt manual_payments; settled jsonb;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 if o.id is null or o.created_by is null then raise exception 'MANUAL_ORDER_REQUIRED'; end if;
 select * into receipt from manual_payments where request_id=p_request;
 if receipt.id is not null then
   if receipt.order_id<>p_order or receipt.method<>p_method or receipt.amount<>p_amount or receipt.reference<>trim(p_reference) then raise exception 'PAYMENT_RECORD_CONFLICT'; end if;
   return to_jsonb(o);
 end if;
 if o.payment_status<>'pending' or o.payment_method<>'manual_pending' or o.authorization_url is not null then raise exception 'PAYMENT_ALREADY_RECEIVED'; end if;
 if o.fulfillment_status='cancelled' then raise exception 'ORDER_CANCELLED'; end if;
 if p_method is null or p_method not in ('cash','bank_transfer') or p_amount is null or p_amount<>o.total or p_reference is null or length(trim(p_reference)) not between 3 and 120 then raise exception 'MANUAL_PAYMENT_INVALID'; end if;
 insert into manual_payments(request_id,order_id,actor,method,amount,reference,note)
 values(p_request,p_order,p_actor,p_method,p_amount,trim(p_reference),coalesce(p_note,'')) returning * into receipt;
 -- Reuse stock commitment, late-stock checks and prescription holds. The provider
 -- identifier is explicitly manual and must never be used for a Paystack refund.
 settled:=settle_payment(o.reference,p_amount,'NGN','manual:'||receipt.id::text,0,o.test_mode);
 update orders set payment_method=p_method where id=p_order;
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'manual_payment_recorded','orders',p_order::text);
 return settled || jsonb_build_object('payment_method',p_method);
end $$;
revoke all on function public.record_manual_payment(uuid,uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.record_manual_payment(uuid,uuid,uuid,text,bigint,text,text) to service_role;
alter function public.record_manual_payment(uuid,uuid,uuid,text,bigint,text,text) set statement_timeout='10s';

-- Cash/transfer refunds require an offline return of funds, never a gateway call.
create function public.guard_manual_refund() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from orders where id=new.order_id and payment_method<>'paystack') then raise exception 'MANUAL_REFUND_REQUIRED'; end if;
 return new;
end $$;
revoke all on function public.guard_manual_refund() from public,anon,authenticated;
create trigger manual_refund_guard before insert on public.refunds for each row execute function public.guard_manual_refund();
