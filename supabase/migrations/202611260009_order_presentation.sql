-- Short customer-facing numbers leave gateway references and UUIDs unchanged.
create sequence public.order_public_number_seq start 100001;
alter table public.orders add column public_reference text not null default ('RP-'||nextval('public.order_public_number_seq')::text);
alter table public.orders add constraint order_public_reference_unique unique(public_reference);
revoke all on sequence public.order_public_number_seq from public,anon,authenticated;

create function public.prepare_paid_order() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.payment_status in ('paid','partially_refunded') and new.fulfillment_status='ready' then
   new.fulfillment_status:='processing';
 end if;
 return new;
end $$;
revoke all on function public.prepare_paid_order() from public,anon,authenticated;
create trigger prepare_paid_order before update of payment_status,fulfillment_status on public.orders
for each row execute function public.prepare_paid_order();
update public.orders set fulfillment_status='processing' where payment_status in ('paid','partially_refunded') and fulfillment_status='ready';

-- Payment proof is private, compressed, and available only to financial staff.
alter table public.upload_tickets drop constraint upload_tickets_kind_check;
alter table public.upload_tickets add constraint upload_tickets_kind_check check(kind in ('media','prescription','payment'));
create table public.payment_evidence (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders,
 actor uuid not null references auth.users,path text not null unique,
 created_at timestamptz not null default now()
);
alter table public.payment_evidence enable row level security;
revoke all on public.payment_evidence from public,anon,authenticated;
grant select,insert,delete on public.payment_evidence to service_role;
alter table public.manual_payment_parts add column evidence_id uuid references public.payment_evidence;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-evidence','payment-evidence',false,3145728,array['image/webp']) on conflict(id) do nothing;

create or replace function public.update_order_tracking(p_order uuid,p_status text,p_note text,p_courier text,p_tracking text,p_estimate text,p_actor uuid,p_request uuid)
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
 if o.zone_snapshot->>'fulfillment_method'='pickup' and p_status='dispatched' then raise exception 'DELIVERY_SEQUENCE'; end if;
 if not ((o.zone_snapshot->>'fulfillment_method'='pickup' and o.fulfillment_status='processing' and p_status='delivered') or (o.fulfillment_status='ready' and p_status='processing') or (o.fulfillment_status='processing' and p_status in ('processing','dispatched'))
    or (o.fulfillment_status='dispatched' and p_status in ('dispatched','delivered')) or (o.fulfillment_status='delivered' and p_status='delivered')) then raise exception 'DELIVERY_SEQUENCE'; end if;
 if o.fulfillment_status=p_status and exists(select 1 from delivery_events where order_id=p_order and status=p_status) and length(trim(coalesce(p_note,'')||coalesce(p_estimate,'')||coalesce(p_courier,'')||coalesce(p_tracking,'')))=0 then raise exception 'TRACKING_EMPTY'; end if;
 if p_status in ('processing','dispatched') and exists(select 1 from stock_reservations r join inventory_batches b on b.id=r.batch_id join order_items i on i.order_id=r.order_id and i.product_id=b.product_id where r.order_id=o.id and i.cancelled_quantity<i.quantity and b.expires_on<=current_date) then raise exception 'ORDER_ON_HOLD'; end if;
 update orders set fulfillment_status=p_status where id=p_order;
 insert into delivery_events(order_id,status,note,courier,tracking_reference,estimated_delivery,request_id)
 values(p_order,p_status,coalesce(p_note,''),coalesce(p_courier,''),coalesce(p_tracking,''),coalesce(p_estimate,''),p_request) returning * into event;
 insert into notification_outbox(dedupe,email,subject,body,kind,order_id,event_id)
 values('delivery:'||p_order||':'||event.id,o.contact->>'email','Delivery update — ReliefPoint Pharmacy','Your delivery has an update. View your order for details.','delivery',p_order,event.id);
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'tracking_updated','orders',p_order::text);
end $$;

create or replace function public.admin_order_records(
 p_resource text, p_query text default '', p_statuses text[] default null,
 p_from timestamptz default null, p_to timestamptz default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_resource not in ('orders','prescriptions','refunds') or p_offset < 0 or p_offset > 240000 then
  raise exception 'INVALID_SEARCH';
 end if;
 with records as (
  select o.id, o.created_at, jsonb_build_object(
   'id',o.id,'reference',o.reference,'public_reference',o.public_reference,'contact',o.contact,'total',o.total,
   'payment_status',o.payment_status,'fulfillment_status',o.fulfillment_status,
   'prescription_status',o.prescription_status,'created_at',o.created_at,'test_mode',o.test_mode
  ) as row, o.id as order_id from orders o
  where p_resource='orders' and (p_statuses is null or o.payment_status=any(p_statuses))
  union all
  select p.id,p.created_at,to_jsonb(p)-'path',p.order_id from prescriptions p where p_resource='prescriptions'
  union all
  select r.id,r.created_at,to_jsonb(r),r.order_id from refunds r where p_resource='refunds'
 ), matching as (
  select r.* from records r join orders o on o.id=r.order_id
  where (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<p_to)
  and (coalesce(p_query,'')='' or
    concat_ws(' ',o.reference,o.public_reference,o.contact->>'name',o.contact->>'email',o.contact->>'phone',
      o.contact->>'address',o.contact->>'state',o.contact->>'lga') ilike '%'||p_query||'%'
    or exists(select 1 from order_items i where i.order_id=o.id and i.name ilike '%'||p_query||'%'))
  order by r.created_at desc,r.id desc offset p_offset limit 25
 ), numbered as (select *,row_number() over(order by created_at desc,id desc) n from matching)
 select jsonb_build_object('rows',coalesce(jsonb_agg(row order by created_at desc,id desc) filter(where n<=24),'[]'::jsonb),
  'more',count(*)>24) into result from numbered;
 return result;
end $$;

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
 insert into receipts(order_id,number,document) values(p_order,replace(o.public_reference,'RP-','RCP-'),jsonb_build_object(
   'version',1,'number',replace(o.public_reference,'RP-','RCP-'),'reference',o.public_reference,'paid_at',p.verified_at,
   'business',jsonb_build_object('name','Relief Point Pharmacy','address',coalesce(business->>'address',''),
     'email','support@reliefpointpharmacy.com','phone','+234 706 784 1607'),
   'customer',jsonb_build_object('name',o.contact->>'name','email',o.contact->>'email','phone',o.contact->>'phone','address',o.contact->>'address'),
   'items',lines,'subtotal',o.subtotal,'delivery',o.delivery,'processing',o.processing,'total',o.total,
   'method',coalesce(method,o.payment_method),'payments',breakdown,'currency','NGN','test_mode',o.test_mode
 )) on conflict(order_id) do nothing;
end $$;

create or replace function public.record_manual_payment_parts(p_actor uuid,p_order uuid,p_request uuid,p_parts jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; receipt manual_payments; part jsonb; normalized jsonb:='[]'; saved jsonb;
 method text; reference text; amount bigint; total bigint:=0; position integer:=0; evidence uuid; settled jsonb;
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
   evidence:=null;
   if nullif(part->>'evidence_id','') is not null then
     begin evidence:=(part->>'evidence_id')::uuid; exception when invalid_text_representation then raise exception 'PAYMENT_EVIDENCE_INVALID'; end;
     if not exists(select 1 from payment_evidence where id=evidence and order_id=p_order) then raise exception 'PAYMENT_EVIDENCE_INVALID'; end if;
   end if;
   total:=total+amount;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('method',method,'amount',amount,'reference',reference,'evidence_id',evidence));
 end loop;
 select * into o from orders where id=p_order for update;
 if o.id is null or o.created_by is null then raise exception 'MANUAL_ORDER_REQUIRED'; end if;
 -- Serialize retries across orders using the same request ID as well as the order lock.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into receipt from manual_payments where request_id=p_request;
 if receipt.id is not null then
   select jsonb_agg(jsonb_build_object('method',m.method,'amount',m.amount,'reference',m.reference,'evidence_id',m.evidence_id) order by m.position)
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
   insert into manual_payment_parts(payment_id,position,method,amount,reference,evidence_id)
   values(receipt.id,position,part->>'method',(part->>'amount')::bigint,part->>'reference',(part->>'evidence_id')::uuid);
 end loop;
 -- Reuse stock checks, prescription holds, receipt creation and mail deduplication.
 settled:=settle_payment(o.reference,total,'NGN','manual:'||receipt.id::text,0,o.test_mode);
 update orders set payment_method=method where id=p_order;
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'manual_payment_recorded','orders',p_order::text);
 return settled||jsonb_build_object('payment_method',method);
end $$;
