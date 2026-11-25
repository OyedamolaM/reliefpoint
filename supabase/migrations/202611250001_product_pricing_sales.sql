-- Optional prices are integer kobo; cost never enters the public catalog.
alter table public.products
 add column discount_price_kobo bigint,
 add column cost_price_kobo bigint,
 add constraint products_discount_valid check(discount_price_kobo is null or (discount_price_kobo>=100 and discount_price_kobo<price_kobo)),
 add constraint products_cost_valid check(cost_price_kobo is null or cost_price_kobo between 0 and 100000000);

-- Preserve existing view column positions. price_kobo is the customer charge.
create or replace view public.catalog with(security_invoker=true) as
 select p.id,p.name,p.slug,p.detail,p.category,p.brand,
 coalesce(p.discount_price_kobo,p.price_kobo) as price_kobo,
 p.image,p.image_alt,p.directions,p.storage,p.prescription,p.deal,p.active,p.created_at,p.updated_at,p.fts,
 coalesce((select sum(b.quantity-b.reserved) from public.inventory_batches b where b.product_id=p.id and b.expires_on>current_date),0)::integer as available,
 p.price_kobo as regular_price_kobo
 from public.products p;

create or replace function public.begin_checkout(p_input jsonb,p_user uuid,p_guest text,p_test boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
  insert into order_items(order_id,product_id,name,quantity,price_kobo,prescription) values(o.id,p.id,p.name,i.quantity,coalesce(p.discount_price_kobo,p.price_kobo),p.prescription);
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
alter function public.begin_checkout(jsonb,uuid,text,boolean) set statement_timeout='10s';

create index payments_sales_date on public.payments(verified_at,order_id) where verified_at is not null;
create function public.admin_sales_summary(p_from timestamptz,p_to timestamptz) returns jsonb
 language plpgsql security definer set search_path=public,pg_temp set statement_timeout='10s' as $$
declare result jsonb;
begin
 if (p_from is null) <> (p_to is null) or p_to<=p_from then raise exception 'INVALID_PERIOD'; end if;
 select jsonb_build_object(
  'paid_kobo',coalesce(sum(o.total) filter(where o.payment_status in ('paid','partially_refunded')),0),
  'confirmed_orders',count(*),
  'pending_payments',(select count(*) from orders where payment_status in ('pending','review')),
  'prescription_queue',(select count(*) from orders where needs_prescription and prescription_status in ('pending','clarification'))
 ) into result from orders o where o.payment_status in ('paid','partially_refunded','refunded')
 and exists(select 1 from payments p where p.order_id=o.id and p.verified_at is not null
  and (p_from is null or (p.verified_at>=p_from and p.verified_at<p_to)));
 return result;
end $$;
revoke execute on function public.admin_sales_summary(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_sales_summary(timestamptz,timestamptz) to service_role;
