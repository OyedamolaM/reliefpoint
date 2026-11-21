create function public.save_category(p_id uuid,p_name text,p_actor uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare old_name text; result uuid; begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role in ('owner','admin','pharmacist')) then raise exception 'FORBIDDEN'; end if;
 if p_id is null then insert into categories(name) values(p_name) on conflict(name) do update set name=excluded.name returning id into result;
 else select name into old_name from categories where id=p_id for update; if old_name is null then raise exception 'CATEGORY_UNAVAILABLE'; end if;update categories set name=p_name where id=p_id;update products set category=p_name,updated_at=now() where category=old_name;result:=p_id;end if;
 return result;
end $$;
revoke execute on function public.save_category(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.save_category(uuid,text,uuid) to service_role;
