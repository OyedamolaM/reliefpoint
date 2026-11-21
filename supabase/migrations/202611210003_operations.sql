create function public.review_prescription(p_order uuid,p_status text,p_note text,p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','pharmacist')) or p_status not in ('approved','rejected','clarification') then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 if not o.needs_prescription or o.prescription_status='awaiting_upload' or o.fulfillment_status in ('dispatched','delivered','cancelled') then raise exception 'PRESCRIPTION_UNAVAILABLE'; end if;
 update prescriptions set reviewed_by=p_actor,notes=p_note,reviewed_at=now() where order_id=p_order;
 update orders set prescription_status=p_status,fulfillment_status=case when payment_status='paid' and p_status='approved' then 'ready' when payment_status='paid' then 'prescription_review' else fulfillment_status end where id=p_order;
 insert into notification_outbox(dedupe,email,subject,body) values('rx:'||p_order||':'||gen_random_uuid(),o.contact->>'email','Prescription update — ReliefPoint Pharmacy','Your pharmacist has updated your prescription review. Sign in or request a secure tracking link to view the update.');
end $$;
create function public.advance_delivery(p_order uuid,p_status text,p_note text,p_courier text,p_tracking text,p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','fulfillment')) then raise exception 'FORBIDDEN'; end if;
 select * into o from orders where id=p_order for update;
 if o.payment_status not in ('paid','partially_refunded') or (exists(select 1 from order_items where order_id=p_order and prescription and cancelled_quantity<quantity) and o.prescription_status<>'approved') then raise exception 'ORDER_ON_HOLD'; end if;
 if not ((o.fulfillment_status='ready' and p_status='processing') or (o.fulfillment_status='processing' and p_status='dispatched') or (o.fulfillment_status='dispatched' and p_status='delivered')) then raise exception 'DELIVERY_SEQUENCE'; end if;
 if p_status in ('processing','dispatched') and exists(select 1 from stock_reservations r join inventory_batches b on b.id=r.batch_id join order_items i on i.order_id=r.order_id and i.product_id=b.product_id where r.order_id=o.id and i.cancelled_quantity<i.quantity and b.expires_on<=current_date) then raise exception 'ORDER_ON_HOLD'; end if;
 update orders set fulfillment_status=p_status where id=p_order;
 insert into delivery_events(order_id,status,note,courier,tracking_reference) values(p_order,p_status,p_note,p_courier,p_tracking);
 insert into notification_outbox(dedupe,email,subject,body) values('delivery:'||p_order||':'||p_status,o.contact->>'email','Delivery update — ReliefPoint Pharmacy','Your delivery status is now '||p_status||'. View your order for details.') on conflict(dedupe) do nothing;
end $$;
create function public.claim_guest_orders(p_user uuid,p_email text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$ declare n integer; begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and lower(email)=lower(p_email)) then raise exception 'FORBIDDEN'; end if;
 update orders set user_id=p_user where user_id is null and lower(contact->>'email')=lower(p_email); get diagnostics n=row_count; return n;
end $$;
create function public.admin_summary() returns jsonb language sql security definer set search_path=public,pg_temp as $$ select jsonb_build_object(
 'paid_kobo',(select coalesce(sum(total),0) from orders where payment_status in ('paid','partially_refunded')),
 'outstanding',(select count(*) from orders where fulfillment_status in ('ready','processing','prescription_review','exception')),
 'prescription_queue',(select count(*) from orders where needs_prescription and prescription_status in ('pending','clarification')),
 'low_stock',(select count(*) from catalog where active and available<5),
 'expiring_batches',(select count(*) from inventory_batches where quantity>0 and expires_on<=current_date+90),
 'failed_mail',(select count(*) from notification_outbox where status='failed')) $$;
revoke execute on function public.review_prescription(uuid,text,text,uuid),public.advance_delivery(uuid,text,text,text,text,uuid),public.claim_guest_orders(uuid,text),public.admin_summary() from public,anon,authenticated;
grant execute on function public.review_prescription(uuid,text,text,uuid),public.advance_delivery(uuid,text,text,text,text,uuid),public.claim_guest_orders(uuid,text),public.admin_summary() to service_role;
