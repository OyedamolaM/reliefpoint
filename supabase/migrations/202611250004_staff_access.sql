-- Private helpers used only after server-side staff authentication and MFA.
create function public.staff_account_by_email(p_email text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',u.id,'verified',u.email_confirmed_at is not null)
 from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
$$;

create function public.manage_staff_role(p_actor uuid,p_user uuid,p_role text,p_remove boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_owner boolean; target_owner boolean;
begin
 perform pg_advisory_xact_lock(827461090);
 select exists(select 1 from staff_roles where user_id=p_actor and role='owner') into actor_owner;
 if not actor_owner and not exists(select 1 from staff_roles where user_id=p_actor and role='admin') then raise exception 'FORBIDDEN'; end if;
 if p_role not in ('owner','admin','pharmacist','fulfillment','support','editor') then raise exception 'INVALID_ROLE'; end if;
 select exists(select 1 from staff_roles where user_id=p_user and role='owner') into target_owner;
 if not actor_owner and (p_role='owner' or target_owner) then raise exception 'OWNER_REQUIRED'; end if;
 if p_remove and p_actor=p_user then raise exception 'SELF_REMOVAL'; end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'STAFF_ACCOUNT_MISSING'; end if;
 if p_remove then delete from staff_roles where user_id=p_user and role=p_role;
 else insert into staff_roles(user_id,role) values(p_user,p_role) on conflict do nothing; end if;
 insert into audit_log(actor,action,resource,resource_id) values(p_actor,case when p_remove then 'staff_role_removed' else 'staff_role_granted' end,'staff_roles',p_user::text);
end $$;
revoke all on function public.staff_account_by_email(text),public.manage_staff_role(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.staff_account_by_email(text),public.manage_staff_role(uuid,uuid,text,boolean) to service_role;
