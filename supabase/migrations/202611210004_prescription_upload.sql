create function public.attach_prescription(p_order uuid,p_path text,p_mime text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare o orders; result uuid; begin
 select * into o from orders where id=p_order for update;
 if not o.needs_prescription or o.fulfillment_status in ('dispatched','delivered','cancelled') then raise exception 'PRESCRIPTION_UNAVAILABLE'; end if;
 insert into prescriptions(order_id,path,mime) values(p_order,p_path,p_mime) returning id into result;
 update orders set prescription_status='pending',fulfillment_status=case when payment_status='paid' then 'prescription_review' else fulfillment_status end where id=p_order;
 return result;
end $$;
revoke execute on function public.attach_prescription(uuid,text,text) from public,anon,authenticated;
grant execute on function public.attach_prescription(uuid,text,text) to service_role;
