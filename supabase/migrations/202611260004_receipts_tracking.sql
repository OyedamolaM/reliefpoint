-- Immutable receipts, customer-visible tracking and transactional notifications.
create table public.receipts (
 order_id uuid primary key references public.orders,
 number text not null unique,
 document jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.receipts enable row level security;
revoke all on public.receipts from public,anon,authenticated;
grant select on public.receipts to service_role;

create function public.capture_receipt(p_order uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; p payments; business jsonb; method text; lines jsonb;
begin
 select * into o from orders where id=p_order;
 select * into p from payments where order_id=p_order;
 if o.payment_status not in ('paid','partially_refunded','refunded') or p.verified_at is null
    or p.provider_status<>'success' or p.received_amount<>o.total then return; end if;
 select public_data into business from settings where id=true;
 select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity,'price_kobo',price_kobo) order by id),'[]'::jsonb)
 into lines from order_items where order_id=p_order;
 select m.method into method from manual_payments m where m.order_id=p_order;
 insert into receipts(order_id,number,document) values(p_order,'RCP-'||o.reference,jsonb_build_object(
   'version',1,'number','RCP-'||o.reference,'reference',o.reference,'paid_at',p.verified_at,
   'business',jsonb_build_object('name','Relief Point Pharmacy','address',coalesce(business->>'address',''),
     'email','support@reliefpointpharmacy.com','phone','+234 706 784 1607'),
   'customer',jsonb_build_object('name',o.contact->>'name','email',o.contact->>'email','phone',o.contact->>'phone','address',o.contact->>'address'),
   'items',lines,'subtotal',o.subtotal,'delivery',o.delivery,'processing',o.processing,'total',o.total,
   'method',coalesce(method,o.payment_method),'currency','NGN','test_mode',o.test_mode
 )) on conflict(order_id) do nothing;
end $$;
create function public.receipt_on_payment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform capture_receipt(new.order_id); return new; end $$;
create trigger receipt_on_verified_payment after update of verified_at on public.payments
for each row when(new.verified_at is not null) execute function public.receipt_on_payment();
create function public.receipt_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'RECEIPT_IMMUTABLE'; end $$;
create trigger receipt_immutable before update or delete on public.receipts for each row execute function public.receipt_immutable();
-- Preserve existing verified purchases without resending historical emails.
do $$ declare r record; begin
 for r in select id from orders where payment_status in ('paid','partially_refunded','refunded') loop
   perform capture_receipt(r.id);
 end loop;
end $$;

alter table public.delivery_events add column request_id uuid unique;
alter table public.delivery_events add column estimated_delivery text not null default '' check(length(estimated_delivery)<=200);
create index delivery_events_order_date on public.delivery_events(order_id,created_at);
create table public.order_staff_notes (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders,
 actor uuid not null references auth.users, request_id uuid not null unique,
 note text not null check(length(trim(note)) between 1 and 1000), created_at timestamptz not null default now()
);
alter table public.order_staff_notes enable row level security;
revoke all on public.order_staff_notes from public,anon,authenticated;
grant select on public.order_staff_notes to service_role;

alter table public.notification_outbox add column kind text not null default 'general';
alter table public.notification_outbox add column order_id uuid references public.orders;
alter table public.notification_outbox add column event_id uuid references public.delivery_events;
alter table public.notification_outbox add column link_expires_at timestamptz;
alter table public.notification_outbox add column provider_message_id text;

-- Existing payment/refund/prescription producers remain transactional. Enrich them
-- here, without changing stock/payment reconciliation or storing raw guest tokens.
create function public.classify_order_mail() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare order_text text;
begin
 if new.dedupe ~ '^(paid|rx|delivery|cancel):[a-f0-9-]{36}' then
   order_text:=split_part(new.dedupe,':',2);
   if exists(select 1 from orders where id=order_text::uuid) then
     new.order_id:=order_text::uuid;
     if new.dedupe like 'paid:%' then
       if exists(select 1 from receipts where order_id=new.order_id) then new.kind:='receipt';
       else new.kind:='order'; new.subject:='Payment update — ReliefPoint Pharmacy';
         new.body:='We are reviewing your payment and order. Please do not pay again. View your order for the latest information.';
       end if;
     elsif new.kind='general' then new.kind:='order'; end if;
   end if;
 end if;
 if new.dedupe ~ '^refund:[a-f0-9-]{36}$' then
   select order_id into new.order_id from refunds where id=split_part(new.dedupe,':',2)::uuid;
   new.kind:='order';
 end if;
 return new;
end $$;
create trigger classify_order_mail before insert on public.notification_outbox for each row execute function public.classify_order_mail();
-- Classify queued legacy messages without changing their delivery status.
update notification_outbox set order_id=split_part(dedupe,':',2)::uuid,
 kind=case when dedupe like 'paid:%' and exists(select 1 from receipts where order_id=split_part(dedupe,':',2)::uuid) then 'receipt' else 'order' end
where status<>'sent' and dedupe ~ '^(paid|rx|delivery|cancel):[a-f0-9-]{36}'
and exists(select 1 from orders where id=split_part(dedupe,':',2)::uuid);

update notification_outbox set subject='Payment update — ReliefPoint Pharmacy',
 body='We are reviewing your payment and order. Please do not pay again. View your order for the latest information.'
 where status<>'sent' and dedupe like 'paid:%' and kind='order';

-- Unique request IDs make retried clicks safe; each new public update gets mail.
create function public.update_order_tracking(p_order uuid,p_status text,p_note text,p_courier text,p_tracking text,p_estimate text,p_actor uuid,p_request uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; event delivery_events;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','fulfillment')) then raise exception 'FORBIDDEN'; end if;
 if p_request is null or p_status is null or p_status not in ('processing','dispatched','delivered')
   or length(coalesce(p_note,''))>1000 or length(coalesce(p_courier,''))>100 or length(coalesce(p_tracking,''))>200 or length(coalesce(p_estimate,''))>200 then raise exception 'TRACKING_INVALID'; end if;
 select * into o from orders where id=p_order for update;
 if o.id is null then raise exception 'ORDER_UNAVAILABLE'; end if;
 select * into event from delivery_events where request_id=p_request;
 if event.id is not null then
   if event.order_id<>p_order or event.status<>p_status or event.note<>coalesce(p_note,'') or coalesce(event.courier,'')<>coalesce(p_courier,'')
      or coalesce(event.tracking_reference,'')<>coalesce(p_tracking,'') or event.estimated_delivery<>coalesce(p_estimate,'') then raise exception 'TRACKING_CONFLICT'; end if;
   return;
 end if;
 if o.payment_status not in ('paid','partially_refunded') or o.fulfillment_status in ('cancelled','exception')
    or (exists(select 1 from order_items where order_id=p_order and prescription and cancelled_quantity<quantity) and o.prescription_status<>'approved') then raise exception 'ORDER_ON_HOLD'; end if;
 if not ((o.fulfillment_status='ready' and p_status='processing') or (o.fulfillment_status='processing' and p_status in ('processing','dispatched'))
    or (o.fulfillment_status='dispatched' and p_status in ('dispatched','delivered')) or (o.fulfillment_status='delivered' and p_status='delivered')) then raise exception 'DELIVERY_SEQUENCE'; end if;
 if o.fulfillment_status=p_status and length(trim(coalesce(p_note,'')||coalesce(p_estimate,'')||coalesce(p_courier,'')||coalesce(p_tracking,'')))=0 then raise exception 'TRACKING_EMPTY'; end if;
 if p_status in ('processing','dispatched') and exists(select 1 from stock_reservations r join inventory_batches b on b.id=r.batch_id join order_items i on i.order_id=r.order_id and i.product_id=b.product_id where r.order_id=o.id and i.cancelled_quantity<i.quantity and b.expires_on<=current_date) then raise exception 'ORDER_ON_HOLD'; end if;
 update orders set fulfillment_status=p_status where id=p_order;
 insert into delivery_events(order_id,status,note,courier,tracking_reference,estimated_delivery,request_id)
 values(p_order,p_status,coalesce(p_note,''),coalesce(p_courier,''),coalesce(p_tracking,''),coalesce(p_estimate,''),p_request) returning * into event;
 insert into notification_outbox(dedupe,email,subject,body,kind,order_id,event_id)
 values('delivery:'||p_order||':'||event.id,o.contact->>'email','Delivery update — ReliefPoint Pharmacy','Your delivery has an update. View your order for details.','delivery',p_order,event.id);
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'tracking_updated','orders',p_order::text);
end $$;
-- Keep compatibility with callers of the old RPC, while preserving the new rules.
create or replace function public.advance_delivery(p_order uuid,p_status text,p_note text,p_courier text,p_tracking text,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform update_order_tracking(p_order,p_status,p_note,p_courier,p_tracking,'',p_actor,gen_random_uuid()); end $$;

create function public.add_order_staff_note(p_order uuid,p_actor uuid,p_request uuid,p_note text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing order_staff_notes;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','pharmacist','fulfillment','support')) then raise exception 'FORBIDDEN'; end if;
 if p_request is null or p_note is null or length(trim(p_note)) not between 1 and 1000 then raise exception 'TRACKING_EMPTY'; end if;
 if not exists(select 1 from orders where id=p_order) then raise exception 'ORDER_UNAVAILABLE'; end if;
 select * into existing from order_staff_notes where request_id=p_request;
 if existing.id is not null then
   if existing.order_id<>p_order or existing.actor<>p_actor or existing.note<>trim(p_note) then raise exception 'TRACKING_CONFLICT'; end if;
   return;
 end if;
 insert into order_staff_notes(order_id,actor,request_id,note) values(p_order,p_actor,p_request,trim(p_note));
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'internal_note_added','orders',p_order::text);
end $$;
revoke all on function public.capture_receipt(uuid),public.receipt_on_payment(),public.receipt_immutable(),public.classify_order_mail(),public.update_order_tracking(uuid,text,text,text,text,text,uuid,uuid),public.add_order_staff_note(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.update_order_tracking(uuid,text,text,text,text,text,uuid,uuid),public.add_order_staff_note(uuid,uuid,uuid,text) to service_role;
alter function public.update_order_tracking(uuid,text,text,text,text,text,uuid,uuid) set statement_timeout='10s';
