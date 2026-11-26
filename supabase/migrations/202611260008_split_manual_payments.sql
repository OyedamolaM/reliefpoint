-- One confirmed collection per manual order, with one or more payment methods.
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
 check(payment_method in ('paystack','manual_pending','cash','bank_transfer','card','other','mixed'));
alter table public.manual_payments drop constraint manual_payments_method_check;
alter table public.manual_payments add constraint manual_payments_method_check
 check(method in ('cash','bank_transfer','card','other','mixed'));
alter table public.manual_payments drop constraint manual_payments_reference_check;
alter table public.manual_payments add constraint manual_payments_reference_check check(length(reference)<=120);
drop index if exists public.manual_payment_receipts;
create table public.manual_payment_parts (
 payment_id uuid not null references public.manual_payments,
 position integer not null check(position between 1 and 10),
 method text not null check(method in ('cash','bank_transfer','card','other')),
 amount bigint not null check(amount>0 and amount<=100000000000),
 reference text not null default '' check(length(reference)<=120),
 primary key(payment_id,position),
 check(method<>'cash' or reference='')
);
insert into public.manual_payment_parts(payment_id,position,method,amount,reference)
 select id,1,method,amount,case when method='cash' then '' else reference end from public.manual_payments;
create unique index manual_payment_part_reference on public.manual_payment_parts(method,lower(trim(reference))) where reference<>'';
alter table public.manual_payment_parts enable row level security;
revoke all on public.manual_payment_parts from public,anon,authenticated;
grant select on public.manual_payment_parts to service_role;

create function public.record_manual_payment_parts(p_actor uuid,p_order uuid,p_request uuid,p_parts jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; receipt manual_payments; part jsonb; normalized jsonb:='[]'; saved jsonb;
 method text; reference text; amount bigint; total bigint:=0; position integer:=0; settled jsonb;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 if p_request is null or jsonb_typeof(p_parts) is distinct from 'array' then raise exception 'MANUAL_PAYMENT_INVALID'; end if;
 if jsonb_array_length(p_parts) not between 1 and 10 or length(coalesce(p_note,''))>1000 then raise exception 'MANUAL_PAYMENT_INVALID'; end if;
 for part in select value from jsonb_array_elements(p_parts) loop
   method:=part->>'method';
   if method is null or method not in ('cash','bank_transfer','card','other') or coalesce(part->>'amount','') !~ '^[1-9][0-9]{0,11}$' then raise exception 'MANUAL_PAYMENT_INVALID'; end if;
   amount:=(part->>'amount')::bigint;
   reference:=case when method='cash' then '' else trim(coalesce(part->>'reference','')) end;
   if amount>100000000000 or length(reference)>120 then raise exception 'MANUAL_PAYMENT_INVALID'; end if;
   total:=total+amount;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('method',method,'amount',amount,'reference',reference));
 end loop;
 select * into o from orders where id=p_order for update;
 if o.id is null or o.created_by is null then raise exception 'MANUAL_ORDER_REQUIRED'; end if;
 -- Serialize retries across orders using the same request ID as well as the order lock.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into receipt from manual_payments where request_id=p_request;
 if receipt.id is not null then
   select jsonb_agg(jsonb_build_object('method',m.method,'amount',m.amount,'reference',m.reference) order by m.position)
   into saved from manual_payment_parts m where payment_id=receipt.id;
   if receipt.order_id<>p_order or saved<>normalized or receipt.note<>coalesce(p_note,'') then raise exception 'PAYMENT_RECORD_CONFLICT'; end if;
   return to_jsonb(o);
 end if;
 if o.payment_status<>'pending' or o.payment_method<>'manual_pending' or o.authorization_url is not null then raise exception 'PAYMENT_ALREADY_RECEIVED'; end if;
 if o.fulfillment_status='cancelled' then raise exception 'ORDER_CANCELLED'; end if;
 if total<>o.total then raise exception 'MANUAL_PAYMENT_TOTAL'; end if;
 method:=case when jsonb_array_length(normalized)>1 then 'mixed' else normalized->0->>'method' end;
 insert into manual_payments(request_id,order_id,actor,method,amount,reference,note)
 values(p_request,p_order,p_actor,method,total,normalized->0->>'reference',coalesce(p_note,'')) returning * into receipt;
 for part in select value from jsonb_array_elements(normalized) loop
   position:=position+1;
   insert into manual_payment_parts(payment_id,position,method,amount,reference)
   values(receipt.id,position,part->>'method',(part->>'amount')::bigint,part->>'reference');
 end loop;
 -- Reuse stock checks, prescription holds, receipt creation and mail deduplication.
 settled:=settle_payment(o.reference,total,'NGN','manual:'||receipt.id::text,0,o.test_mode);
 update orders set payment_method=method where id=p_order;
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'manual_payment_recorded','orders',p_order::text);
 return settled||jsonb_build_object('payment_method',method);
end $$;
revoke all on function public.record_manual_payment_parts(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_manual_payment_parts(uuid,uuid,uuid,jsonb,text) to service_role;
alter function public.record_manual_payment_parts(uuid,uuid,uuid,jsonb,text) set statement_timeout='10s';

-- Keep the original single-payment signature for older deployments and callers.
create or replace function public.record_manual_payment(p_actor uuid,p_order uuid,p_request uuid,p_method text,p_amount bigint,p_reference text,p_note text)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select record_manual_payment_parts(p_actor,p_order,p_request,jsonb_build_array(jsonb_build_object('method',p_method,'amount',p_amount,'reference',coalesce(p_reference,''))),p_note);
$$;

-- Include collection amounts in future immutable receipts; preserve historical receipts.
create or replace function public.capture_receipt(p_order uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; p payments; business jsonb; method text; lines jsonb; breakdown jsonb;
begin
 select * into o from orders where id=p_order;
 select * into p from payments where order_id=p_order;
 if o.payment_status not in ('paid','partially_refunded','refunded') or p.verified_at is null
    or p.provider_status<>'success' or p.received_amount<>o.total then return; end if;
 select public_data into business from settings where id=true;
 select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity,'price_kobo',price_kobo) order by id),'[]'::jsonb)
 into lines from order_items where order_id=p_order;
 select m.method into method from manual_payments m where m.order_id=p_order;
 select coalesce(jsonb_agg(jsonb_build_object('method',parts.method,'amount',parts.amount) order by parts.position),'[]'::jsonb)
 into breakdown from manual_payment_parts parts join manual_payments m on m.id=parts.payment_id where m.order_id=p_order;
 insert into receipts(order_id,number,document) values(p_order,'RCP-'||o.reference,jsonb_build_object(
   'version',1,'number','RCP-'||o.reference,'reference',o.reference,'paid_at',p.verified_at,
   'business',jsonb_build_object('name','Relief Point Pharmacy','address',coalesce(business->>'address',''),
     'email','support@reliefpointpharmacy.com','phone','+234 706 784 1607'),
   'customer',jsonb_build_object('name',o.contact->>'name','email',o.contact->>'email','phone',o.contact->>'phone','address',o.contact->>'address'),
   'items',lines,'subtotal',o.subtotal,'delivery',o.delivery,'processing',o.processing,'total',o.total,
   'method',coalesce(method,o.payment_method),'payments',breakdown,'currency','NGN','test_mode',o.test_mode
 )) on conflict(order_id) do nothing;
end $$;
