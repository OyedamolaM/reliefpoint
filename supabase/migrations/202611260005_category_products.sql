-- Save the category and selected product assignments in a single transaction.
create function public.save_category_products(p_id uuid,p_name text,p_products uuid[],p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare category_id uuid; product_id uuid; matched integer:=0;
begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','pharmacist')) then raise exception 'FORBIDDEN'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or cardinality(p_products)>500 then raise exception 'CATEGORY_INVALID'; end if;
 -- Serialize category edits, including renaming and reassignment, consistently.
 perform pg_advisory_xact_lock(827461091);
 for product_id in select id from products where id=any(coalesce(p_products,'{}'::uuid[])) order by id for update loop
   matched:=matched+1;
 end loop;
 if matched<>(select count(distinct id) from unnest(coalesce(p_products,'{}'::uuid[])) id) then raise exception 'CATEGORY_PRODUCTS_MISSING'; end if;
 category_id:=save_category(p_id,trim(p_name),p_actor);
 update products set category=trim(p_name),updated_at=now() where id=any(coalesce(p_products,'{}'::uuid[])) and category<>trim(p_name);
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,'category_products_saved','categories',category_id::text);
 return category_id;
end $$;
revoke all on function public.save_category_products(uuid,text,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.save_category_products(uuid,text,uuid[],uuid) to service_role;
alter function public.save_category_products(uuid,text,uuid[],uuid) set statement_timeout='10s';
