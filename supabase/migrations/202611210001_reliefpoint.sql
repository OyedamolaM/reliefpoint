-- All money is integer kobo. Browser clients cannot write operational tables.
create extension if not exists pgcrypto;
revoke create on schema public from public,anon,authenticated;
create table public.profiles (id uuid primary key references auth.users on delete cascade, name text not null default '', phone text not null default '', created_at timestamptz not null default now());
create table public.staff_roles (user_id uuid references auth.users on delete cascade, role text check(role in ('owner','admin','pharmacist','fulfillment','support','editor')), primary key(user_id,role));
create function public.staff_allowed(wanted text[]) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from staff_roles where user_id=auth.uid() and role=any(wanted)); $$;
create table public.app_sessions (id uuid primary key, user_id uuid not null references auth.users on delete cascade, created_at timestamptz not null default now(), last_seen timestamptz not null default now(), revoked boolean not null default false, recovery boolean not null default false);
create table public.rate_limits (key text primary key, window_start timestamptz not null, hits integer not null);
create table public.addresses (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, name text not null, phone text not null, address text not null, state text not null, lga text not null);
create table public.shopping_lists (user_id uuid primary key references auth.users on delete cascade, cart jsonb not null default '[]', wishlist jsonb not null default '[]', updated_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), name text unique not null);
create table public.products (id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, detail text not null default '', category text not null, brand text not null default '', price_kobo bigint not null check(price_kobo>=100), image text not null, image_alt text not null, directions text not null, storage text not null, prescription boolean not null default false, deal boolean not null default false, active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.slug_redirects (kind text not null check(kind in ('product','post')), slug text not null, target_id uuid not null, primary key(kind,slug));
create table public.inventory_batches (id uuid primary key default gen_random_uuid(), product_id uuid not null references products, lot text not null, expires_on date not null, quantity integer not null check(quantity>=0), reserved integer not null default 0 check(reserved>=0 and reserved<=quantity), unique(product_id,lot));
create table public.inventory_movements (id uuid primary key default gen_random_uuid(), batch_id uuid references inventory_batches, quantity integer not null, reason text not null, actor uuid references auth.users, created_at timestamptz not null default now());
create table public.shipping_zones (id uuid primary key default gen_random_uuid(), state text not null, lga text not null, area text not null default '', fee_kobo bigint not null check(fee_kobo>=0), free_over_kobo bigint check(free_over_kobo>=0), estimate text not null, active boolean not null default true, unique(state,lga,area));
create table public.settings (id boolean primary key default true check(id), public_data jsonb not null default '{}', checkout_enabled boolean not null default false, launch_approved boolean not null default false, worker_last_success timestamptz, refund_fee_policy text check(refund_fee_policy in ('refund','retain')), prescription_retention_days integer check(prescription_retention_days between 1 and 3650), fee_rate integer not null default 150 check(fee_rate between 0 and 9999), fee_fixed bigint not null default 10000 check(fee_fixed>=0), fee_threshold bigint not null default 250000 check(fee_threshold>=0), fee_cap bigint not null default 200000 check(fee_cap>=0));
insert into settings(id) values(true);
create table public.orders (id uuid primary key default gen_random_uuid(), reference text unique not null, request_id uuid unique not null, user_id uuid references auth.users, guest_hash text, contact jsonb not null, zone_snapshot jsonb not null, subtotal bigint not null, delivery bigint not null, processing bigint not null, total bigint not null check(total=subtotal+delivery+processing), fee_snapshot jsonb not null, payment_status text not null default 'pending' check(payment_status in ('pending','paid','review','partially_refunded','refunded')), fulfillment_status text not null default 'awaiting_payment' check(fulfillment_status in ('awaiting_payment','prescription_review','ready','processing','dispatched','delivered','cancelled','exception')), needs_prescription boolean not null, prescription_status text not null default 'not_required' check(prescription_status in ('not_required','awaiting_upload','pending','clarification','approved','rejected')), reservation_expires timestamptz not null default now()+interval '20 minutes', reservation_released boolean not null default false, stock_committed boolean not null default false, test_mode boolean not null, provider_id text unique, authorization_url text, created_at timestamptz not null default now());
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, product_id uuid not null references products, name text not null, quantity integer not null check(quantity>0), price_kobo bigint not null, prescription boolean not null, cancelled_quantity integer not null default 0 check(cancelled_quantity>=0 and cancelled_quantity<=quantity));
create table public.stock_reservations (order_id uuid not null references orders, batch_id uuid not null references inventory_batches, quantity integer not null check(quantity>0), primary key(order_id,batch_id));
create table public.prescriptions (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, path text unique not null, mime text not null, created_at timestamptz not null default now(), reviewed_by uuid references auth.users, notes text, reviewed_at timestamptz);
create table public.payments (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, reference text unique not null, expected_amount bigint not null, received_amount bigint, provider_fee bigint, provider_status text not null default 'pending', verified_at timestamptz);
create table public.refunds (id uuid primary key default gen_random_uuid(), request_id uuid not null unique default gen_random_uuid(), order_id uuid not null references orders, amount bigint not null check(amount>0), reason text not null, status text not null default 'pending' check(status in ('pending','processing','processed','failed')), provider_id text unique, actor uuid not null references auth.users, created_at timestamptz not null default now());
create table public.delivery_events (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders, status text not null, note text not null default '', courier text, tracking_reference text, created_at timestamptz not null default now());
create table public.blog_posts (id uuid primary key default gen_random_uuid(), title text not null, slug text unique not null, summary text not null, category text not null, cover text not null, cover_alt text not null, blocks jsonb not null, instagram text not null default '', status text not null default 'draft' check(status in ('draft','published','archived')), author_id uuid not null references auth.users, author_name text not null, reviewer_id uuid references auth.users, reviewer_name text, published_at timestamptz, updated_at timestamptz not null default now());
create table public.contact_messages (id uuid primary key default gen_random_uuid(), name text not null, email text not null, message text not null, resolved boolean not null default false, created_at timestamptz not null default now());
create table public.tracking_tokens (hash text primary key, order_id uuid not null references orders, expires_at timestamptz not null);
create table public.webhook_events (id text primary key, payload jsonb not null, status text not null default 'pending', attempts integer not null default 0, next_attempt timestamptz not null default now(), locked_at timestamptz, created_at timestamptz not null default now());
create table public.notification_outbox (id uuid primary key default gen_random_uuid(), dedupe text unique not null, email text not null, subject text not null, body text not null, status text not null default 'pending', attempts integer not null default 0, next_attempt timestamptz not null default now(), locked_at timestamptz, created_at timestamptz not null default now());
create table public.audit_log (id uuid primary key default gen_random_uuid(), actor uuid references auth.users, action text not null, resource text not null, resource_id text, created_at timestamptz not null default now());
create index products_search on products using gin(to_tsvector('simple',name||' '||detail||' '||category));
create index products_listing on products(active,category,price_kobo,id);
create index inventory_available on inventory_batches(product_id,expires_on);
create index orders_customer on orders(user_id,created_at desc);
create index orders_email on orders(lower(contact->>'email'));
create index orders_pending on orders(payment_status,reservation_expires);
create index blog_published on blog_posts(status,published_at desc);
create index notification_pending on notification_outbox(status,next_attempt);
create index webhook_pending on webhook_events(status,next_attempt);

create view public.catalog with(security_invoker=true) as select p.*, coalesce((select sum(b.quantity-b.reserved) from inventory_batches b where b.product_id=p.id and b.expires_on>current_date),0)::integer as available from products p;

-- No anonymous table access. Public data is projected and cached by the server.
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I enable row level security',t.tablename); end loop; end $$;
create policy profile_read on profiles for select to authenticated using(id=auth.uid() or staff_allowed(array['owner','admin','support']));
create policy role_read on staff_roles for select to authenticated using(user_id=auth.uid());
create policy address_read on addresses for select to authenticated using(user_id=auth.uid());
create policy shopping_read on shopping_lists for select to authenticated using(user_id=auth.uid());
create policy order_read on orders for select to authenticated using(user_id=auth.uid() or staff_allowed(array['owner','admin','pharmacist','fulfillment','support']));
create policy item_read on order_items for select to authenticated using(exists(select 1 from orders o where o.id=order_id and (o.user_id=auth.uid() or staff_allowed(array['owner','admin','pharmacist','fulfillment','support']))));
-- Explicit grants, with no operational writes through the Data API.
revoke all on all tables in schema public from anon, authenticated;
grant select on profiles,staff_roles,addresses,shopping_lists,orders,order_items to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

create function public.take_rate(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; begin
 insert into rate_limits(key,window_start,hits) values(p_key,now(),1) on conflict(key) do update set hits=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else rate_limits.hits+1 end,window_start=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_start end returning hits into n;
 return n<=p_limit;
end $$;
create function public.calculate_quote(p_items jsonb,p_zone uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s settings; z shipping_zones; i record; p record; sub bigint:=0; shipping bigint; base bigint; lo bigint; hi bigint; mid bigint; fee bigint; rx boolean:=false;
begin
 select * into s from settings where id; select * into z from shipping_zones where id=p_zone and active;
 if z.id is null then raise exception 'DELIVERY_UNAVAILABLE'; end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'INVALID_BASKET'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'id') from jsonb_array_elements(p_items)) then raise exception 'INVALID_BASKET'; end if;
 for i in select * from jsonb_to_recordset(p_items) as x(id uuid,quantity integer) loop
  if i.quantity<1 or i.quantity>99 then raise exception 'INVALID_BASKET'; end if;
  select * into p from catalog where id=i.id and active;
  if p.id is null or p.available<i.quantity then raise exception 'STOCK_UNAVAILABLE'; end if;
  sub:=sub+p.price_kobo*i.quantity; rx:=rx or p.prescription;
 end loop;
 shipping:=case when z.free_over_kobo is not null and sub>=z.free_over_kobo then 0 else z.fee_kobo end;
 base:=sub+shipping; lo:=base; hi:=least(base+s.fee_cap,s.fee_threshold-1);
 if base<s.fee_threshold then
  while lo<hi loop mid:=(lo+hi)/2; fee:=least(s.fee_cap,ceil(mid*s.fee_rate::numeric/10000)::bigint); if mid-fee>=base then hi:=mid; else lo:=mid+1; end if; end loop;
  fee:=least(s.fee_cap,ceil(lo*s.fee_rate::numeric/10000)::bigint);
  if lo-fee>=base then return jsonb_build_object('subtotal',sub,'delivery',shipping,'processing',lo-base,'total',lo,'prescription',rx,'eta',z.estimate); end if;
 end if;
 lo:=greatest(base,s.fee_threshold); hi:=base+s.fee_cap;
 while lo<hi loop mid:=(lo+hi)/2; fee:=least(s.fee_cap,ceil(mid*s.fee_rate::numeric/10000)::bigint+case when mid>=s.fee_threshold then s.fee_fixed else 0 end); if mid-fee>=base then hi:=mid; else lo:=mid+1; end if; end loop;
 return jsonb_build_object('subtotal',sub,'delivery',shipping,'processing',lo-base,'total',lo,'prescription',rx,'eta',z.estimate);
end $$;

create function public.begin_checkout(p_input jsonb,p_user uuid,p_guest text,p_test boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q jsonb; o orders; s settings; i record; b record; left_qty integer; take_qty integer; p products;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_input->>'request_id',0));
 select * into o from orders where request_id=(p_input->>'request_id')::uuid;
 if o.id is not null then
  if (p_user is not null and o.user_id=p_user) or (p_guest is not null and o.guest_hash=p_guest) then return to_jsonb(o); end if;
  raise exception 'ORDER_UNAVAILABLE';
 end if;
 select * into s from settings where id;
 if not s.checkout_enabled or (not p_test and (not s.launch_approved or s.worker_last_success is null or s.worker_last_success<now()-interval '10 minutes' or coalesce(s.public_data->>'privacy_text','')='' or coalesce(s.public_data->>'shipping_text','')='' or coalesce(s.public_data->>'refund_text','')='' or s.refund_fee_policy is null or s.prescription_retention_days is null or coalesce(s.public_data->>'address','')='' or coalesce(s.public_data->>'opening_hours','')='' or coalesce(s.public_data->>'pcn_logo','')='')) then raise exception 'CHECKOUT_UNAVAILABLE'; end if;
 -- Consistent product lock order serializes stock allocation across concurrent carts.
 perform id from products where id in(select (value->>'id')::uuid from jsonb_array_elements(p_input->'items')) order by id for update;
 q:=calculate_quote(p_input->'items',(p_input->>'zone_id')::uuid);
 insert into orders(reference,request_id,user_id,guest_hash,contact,zone_snapshot,subtotal,delivery,processing,total,fee_snapshot,needs_prescription,prescription_status,test_mode)
 values('RP-'||replace(gen_random_uuid()::text,'-',''),(p_input->>'request_id')::uuid,p_user,p_guest,p_input->'contact',(select to_jsonb(z) from shipping_zones z where id=(p_input->>'zone_id')::uuid),(q->>'subtotal')::bigint,(q->>'delivery')::bigint,(q->>'processing')::bigint,(q->>'total')::bigint,jsonb_build_object('rate',s.fee_rate,'fixed',s.fee_fixed,'threshold',s.fee_threshold,'cap',s.fee_cap),(q->>'prescription')::boolean,case when (q->>'prescription')::boolean then 'awaiting_upload' else 'not_required' end,p_test) returning * into o;
 for i in select * from jsonb_to_recordset(p_input->'items') as x(id uuid,quantity integer) loop
  select * into p from products where id=i.id;
  insert into order_items(order_id,product_id,name,quantity,price_kobo,prescription) values(o.id,p.id,p.name,i.quantity,p.price_kobo,p.prescription);
  left_qty:=i.quantity;
  for b in select * from inventory_batches where product_id=i.id and expires_on>current_date and quantity>reserved order by expires_on,id for update loop
   take_qty:=least(left_qty,b.quantity-b.reserved); update inventory_batches set reserved=reserved+take_qty where id=b.id;
   insert into stock_reservations values(o.id,b.id,take_qty); left_qty:=left_qty-take_qty; exit when left_qty=0;
  end loop;
  if left_qty>0 then raise exception 'STOCK_UNAVAILABLE'; end if;
 end loop;
 insert into payments(order_id,reference,expected_amount) values(o.id,o.reference,o.total);
 return to_jsonb(o);
end $$;

create function public.release_expired() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; r record; n integer:=0; begin
 for o in select * from orders where payment_status='pending' and not reservation_released and reservation_expires<now() order by id for update skip locked loop
  for r in select * from stock_reservations where order_id=o.id order by batch_id loop update inventory_batches set reserved=reserved-r.quantity where id=r.batch_id; end loop;
  update orders set reservation_released=true where id=o.id; n:=n+1;
 end loop; return n;
end $$;

create function public.settle_payment(p_reference text,p_amount bigint,p_currency text,p_provider text,p_fee bigint,p_test boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; r record; enough boolean:=true; begin
 select * into o from orders where reference=p_reference for update;
 if o.id is null then raise exception 'ORDER_UNAVAILABLE'; end if;
 if o.payment_status in ('paid','partially_refunded','refunded','review') then return to_jsonb(o); end if;
 if o.total<>p_amount or p_currency<>'NGN' or o.test_mode<>p_test then
  update orders set payment_status='review',fulfillment_status='exception',provider_id=p_provider where id=o.id returning * into o;
  update payments set provider_status='success',received_amount=p_amount,provider_fee=p_fee,verified_at=now() where reference=p_reference;
  return to_jsonb(o);
 end if;
 if o.reservation_released then
  -- Late payments do not reuse reservations that may now belong to another order.
  for r in select sr.*,b.quantity-b.reserved as available,b.expires_on from stock_reservations sr join inventory_batches b on b.id=sr.batch_id where order_id=o.id order by batch_id for update of b loop
   if r.available<r.quantity or r.expires_on<=current_date then enough:=false; end if;
  end loop;
 end if;
 if o.fulfillment_status='cancelled' or exists(select 1 from stock_reservations expiry_reservation join inventory_batches b on b.id=expiry_reservation.batch_id where expiry_reservation.order_id=o.id and b.expires_on<=current_date) then enough:=false; end if;
 if enough then
  for r in select * from stock_reservations where order_id=o.id order by batch_id loop
   update inventory_batches set quantity=quantity-r.quantity,reserved=reserved-case when o.reservation_released then 0 else r.quantity end where id=r.batch_id;
   insert into inventory_movements(batch_id,quantity,reason) values(r.batch_id,-r.quantity,'Payment '||o.reference);
  end loop;
 end if;
 update orders set payment_status=case when enough then 'paid' else 'review' end,stock_committed=enough,provider_id=p_provider,fulfillment_status=case when not enough then 'exception' when needs_prescription and prescription_status<>'approved' then 'prescription_review' else 'ready' end where id=o.id returning * into o;
 update payments set provider_status='success',received_amount=p_amount,provider_fee=p_fee,verified_at=now() where reference=p_reference;
 insert into notification_outbox(dedupe,email,subject,body) values('paid:'||o.id,o.contact->>'email','Payment received — ReliefPoint Pharmacy','Payment received for order '||o.reference||'. Amount: NGN '||(o.total::numeric/100)::text||'. View your order in your account or request a secure tracking link with your reference and checkout email.'||case when o.needs_prescription then ' Pharmacist approval is required before dispatch.' else '' end) on conflict(dedupe) do nothing;
 return to_jsonb(o);
end $$;

create function public.reserve_refund(p_order uuid,p_amount bigint,p_reason text,p_actor uuid,p_request uuid default gen_random_uuid()) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders; committed bigint; r refunds; s settings; maximum bigint;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 select * into r from refunds where request_id=p_request;
 if r.id is not null then if r.order_id<>p_order or r.actor<>p_actor or r.amount<>p_amount then raise exception 'REFUND_AMOUNT_INVALID'; end if;return to_jsonb(r);end if;
 select * into s from settings where id;
 if s.refund_fee_policy is null then raise exception 'REFUND_POLICY_REQUIRED'; end if;
 if o.payment_status not in ('paid','partially_refunded','review') or o.provider_id is null then raise exception 'REFUND_UNAVAILABLE'; end if;
 select coalesce(sum(amount),0) into committed from refunds where order_id=p_order and status<>'failed';
 maximum:=least(o.total,coalesce((select received_amount from payments where order_id=p_order),o.total))-case when s.refund_fee_policy='retain' then o.processing else 0 end;
 if p_amount<1 or committed+p_amount>maximum then raise exception 'REFUND_AMOUNT_INVALID'; end if;
 insert into refunds(order_id,amount,reason,actor,request_id) values(p_order,p_amount,p_reason,p_actor,p_request) returning * into r; return to_jsonb(r);
end $$;

create function public.apply_refund(p_id uuid,p_status text,p_provider text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r refunds; o orders; refunded bigint; begin
 select * into r from refunds where id=p_id; if r.id is null then return; end if;
 select * into o from orders where id=r.order_id for update;
 if r.status='processed' then return; end if;
 update refunds set status=p_status,provider_id=coalesce(p_provider,provider_id) where id=p_id;
 select coalesce(sum(amount),0) into refunded from refunds where order_id=o.id and status='processed';
 if refunded>0 then update orders set payment_status=case when refunded>=o.total-case when (select refund_fee_policy from settings where id)='retain' then o.processing else 0 end then 'refunded' else 'partially_refunded' end where id=o.id; end if;
 if p_status='processed' then insert into notification_outbox(dedupe,email,subject,body) values('refund:'||r.id,o.contact->>'email','Refund update — ReliefPoint Pharmacy','Your refund has been processed. Your bank determines when the funds become available.') on conflict(dedupe) do nothing; end if;
end $$;

create function public.adjust_inventory(p_batch uuid,p_delta integer,p_actor uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','pharmacist')) then raise exception 'FORBIDDEN'; end if;
 update inventory_batches set quantity=quantity+p_delta where id=p_batch and quantity+p_delta>=reserved;
 if not found then raise exception 'STOCK_UNAVAILABLE'; end if;
 insert into inventory_movements(batch_id,quantity,reason,actor) values(p_batch,p_delta,p_reason,p_actor);
end $$;

-- Durable work leases survive function restarts and allow safe retry.
create function public.claim_work(p_kind text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare result jsonb; begin
 if p_kind='mail' then
  with picked as(select id from notification_outbox where status in ('pending','processing') and next_attempt<=now() and (locked_at is null or locked_at<now()-interval '2 minutes') and attempts<8 order by created_at limit 10 for update skip locked), updated as(update notification_outbox set status='processing',locked_at=now(),attempts=attempts+1 where id in(select id from picked) returning *) select coalesce(jsonb_agg(to_jsonb(updated)),'[]') into result from updated;
 else
  with picked as(select id from webhook_events where status in ('pending','processing') and next_attempt<=now() and (locked_at is null or locked_at<now()-interval '2 minutes') and attempts<8 order by created_at limit 10 for update skip locked), updated as(update webhook_events set status='processing',locked_at=now(),attempts=attempts+1 where id in(select id from picked) returning *) select coalesce(jsonb_agg(to_jsonb(updated)),'[]') into result from updated;
 end if; return result;
end $$;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.staff_allowed(text[]) to authenticated;
grant execute on all functions in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('pharmacy-media','pharmacy-media',true,10485760,array['image/webp']),
 ('prescriptions','prescriptions',false,5242880,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
-- Storage writes and prescription reads are server-only; no anonymous upload policies.
alter function public.begin_checkout(jsonb,uuid,text,boolean) set statement_timeout='10s';
alter function public.settle_payment(text,bigint,text,text,bigint,boolean) set statement_timeout='10s';
