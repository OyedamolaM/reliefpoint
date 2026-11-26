alter table public.shipping_zones add column fulfillment_method text not null default 'delivery' check(fulfillment_method in ('delivery','pickup'));
alter table public.shipping_zones add constraint pickup_has_no_delivery_fee check(fulfillment_method<>'pickup' or (fee_kobo=0 and free_over_kobo is null));

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
 if o.fulfillment_status=p_status and length(trim(coalesce(p_note,'')||coalesce(p_estimate,'')||coalesce(p_courier,'')||coalesce(p_tracking,'')))=0 then raise exception 'TRACKING_EMPTY'; end if;
 if p_status in ('processing','dispatched') and exists(select 1 from stock_reservations r join inventory_batches b on b.id=r.batch_id join order_items i on i.order_id=r.order_id and i.product_id=b.product_id where r.order_id=o.id and i.cancelled_quantity<i.quantity and b.expires_on<=current_date) then raise exception 'ORDER_ON_HOLD'; end if;
 update orders set fulfillment_status=p_status where id=p_order;
 insert into delivery_events(order_id,status,note,courier,tracking_reference,estimated_delivery,request_id)
 values(p_order,p_status,coalesce(p_note,''),coalesce(p_courier,''),coalesce(p_tracking,''),coalesce(p_estimate,''),p_request) returning * into event;
 insert into notification_outbox(dedupe,email,subject,body,kind,order_id,event_id)
 values('delivery:'||p_order||':'||event.id,o.contact->>'email','Delivery update — ReliefPoint Pharmacy','Your delivery has an update. View your order for details.','delivery',p_order,event.id);
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'tracking_updated','orders',p_order::text);
end $$;
