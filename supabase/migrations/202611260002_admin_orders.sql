-- Staff-created orders use manual collection, without a Paystack processing fee.
alter table public.orders add column created_by uuid references auth.users;
alter table public.orders add column payment_method text not null default 'paystack' check(payment_method in ('paystack','manual_pending','cash','bank_transfer'));
create function public.create_admin_order(p_actor uuid,p_input jsonb,p_guest text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q jsonb; o orders; i record; b record; left_qty integer; take_qty integer; p products;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 if p_guest is null or length(p_guest)<>64 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_input->>'request_id',0));
 select * into o from orders where request_id=(p_input->>'request_id')::uuid;
 if o.id is not null then
  if o.created_by=p_actor and o.guest_hash=p_guest then return to_jsonb(o) || jsonb_build_object('link_expires_at',(select expires_at from tracking_tokens where hash=p_token_hash and order_id=o.id)); end if;
  raise exception 'ORDER_UNAVAILABLE';
 end if;
 -- Consistent product lock order serializes stock allocation across concurrent carts.
 perform id from products where id in(select (value->>'id')::uuid from jsonb_array_elements(p_input->'items')) order by id for update;
 q:=calculate_quote(p_input->'items',(p_input->>'zone_id')::uuid);
 insert into orders(reference,request_id,user_id,guest_hash,contact,zone_snapshot,subtotal,delivery,processing,total,fee_snapshot,needs_prescription,prescription_status,test_mode,created_by,payment_method)
 values('RP-'||replace(gen_random_uuid()::text,'-',''),(p_input->>'request_id')::uuid,null,p_guest,p_input->'contact',(select to_jsonb(z) from shipping_zones z where id=(p_input->>'zone_id')::uuid),(q->>'subtotal')::bigint,(q->>'delivery')::bigint,0,(q->>'subtotal')::bigint+(q->>'delivery')::bigint,'{"collection":"manual","rate":0,"fixed":0,"cap":0}'::jsonb,(q->>'prescription')::boolean,case when (q->>'prescription')::boolean then 'awaiting_upload' else 'not_required' end,false,p_actor,'manual_pending') returning * into o;
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
 insert into tracking_tokens(hash,order_id,expires_at) values(p_token_hash,o.id,now()+interval '30 minutes');
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'admin_order_created','orders',o.id::text);
 return to_jsonb(o) || jsonb_build_object('link_expires_at',now()+interval '30 minutes');
end $$;
revoke all on function public.create_admin_order(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_admin_order(uuid,jsonb,text,text) to service_role;
alter function public.create_admin_order(uuid,jsonb,text,text) set statement_timeout='10s';
