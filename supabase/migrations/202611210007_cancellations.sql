create function public.cancel_order(p_order uuid,p_actor uuid,p_note text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; r record; begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 if o.fulfillment_status in ('dispatched','delivered') then raise exception 'ORDER_ALREADY_DISPATCHED'; end if;
 if not o.stock_committed and not o.reservation_released then
  for r in select * from stock_reservations where order_id=p_order order by batch_id loop update inventory_batches set reserved=reserved-r.quantity where id=r.batch_id; end loop;
  update orders set reservation_released=true where id=p_order;
 end if;
 update order_items set cancelled_quantity=quantity where order_id=p_order;
 update orders set fulfillment_status='cancelled' where id=p_order;
 insert into delivery_events(order_id,status,note) values(p_order,'cancelled',p_note);
 insert into notification_outbox(dedupe,email,subject,body) values('cancel:'||p_order,o.contact->>'email','Order cancellation — ReliefPoint Pharmacy','Your order has been cancelled. Any applicable refund is shown separately in your order details.') on conflict(dedupe) do nothing;
end $$;
create function public.cancel_item(p_order uuid,p_item uuid,p_quantity integer,p_actor uuid,p_note text) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; item order_items; begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 if o.payment_status not in ('paid','partially_refunded') or o.fulfillment_status in ('dispatched','delivered','cancelled') then raise exception 'CANCELLATION_UNAVAILABLE'; end if;
 select * into item from order_items where id=p_item and order_id=p_order;
 if item.id is null or p_quantity<1 or p_quantity>item.quantity-item.cancelled_quantity then raise exception 'INVALID_QUANTITY'; end if;
 update order_items set cancelled_quantity=cancelled_quantity+p_quantity where id=p_item;
 update orders set fulfillment_status=case when exists(select 1 from order_items where order_id=p_order and cancelled_quantity<quantity) then 'exception' else 'cancelled' end where id=p_order;
 insert into delivery_events(order_id,status,note) values(p_order,'item_cancelled',item.name||': '||p_quantity||' cancelled. '||p_note);
end $$;
create function public.approve_remaining(p_order uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 if o.payment_status<>'partially_refunded' or o.fulfillment_status<>'exception' or not exists(select 1 from order_items where order_id=p_order and cancelled_quantity>0) or not exists(select 1 from order_items where order_id=p_order and cancelled_quantity<quantity) then raise exception 'REMAINDER_UNAVAILABLE'; end if;
 if exists(select 1 from order_items where order_id=p_order and prescription and cancelled_quantity<quantity) and o.prescription_status<>'approved' then raise exception 'ORDER_ON_HOLD'; end if;
 update orders set fulfillment_status='ready' where id=p_order;
end $$;
revoke execute on function public.cancel_order(uuid,uuid,text),public.cancel_item(uuid,uuid,integer,uuid,text),public.approve_remaining(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_order(uuid,uuid,text),public.cancel_item(uuid,uuid,integer,uuid,text),public.approve_remaining(uuid,uuid) to service_role;
