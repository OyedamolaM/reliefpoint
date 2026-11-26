-- Server-only owner recovery. Environment binding and live Auth factor verification
-- happen on the server; session and remembered MFA are checked again here.
create function public.recover_owner_access(p_user uuid,p_email text,p_session uuid,p_mfa_hash text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare restored integer;
begin
 perform pg_advisory_xact_lock(827461090);
 if not exists (
   select 1 from auth.users u
   join app_sessions s on s.user_id=u.id and s.id=p_session
   join mfa_browser_grants m on m.user_id=u.id and m.token_hash=p_mfa_hash
   left join profiles p on p.id=u.id
   where u.id=p_user and lower(u.email)=lower(trim(p_email))
     and u.email_confirmed_at is not null
     and not s.revoked and not s.recovery
     and s.last_seen > now()-interval '24 hours'
     and s.created_at > now()-interval '7 days'
     and m.verified_at <= now() and m.expires_at > now()
     and m.expires_at <= m.verified_at+interval '24 hours'
     and (p.sessions_revoked_at is null or
       (s.created_at > p.sessions_revoked_at and m.verified_at > p.sessions_revoked_at))
 ) then raise exception 'OWNER_RECOVERY_REQUIRED'; end if;
 insert into staff_roles(user_id,role) values(p_user,'owner') on conflict do nothing;
 get diagnostics restored = row_count;
 if restored > 0 then
   insert into audit_log(actor,action,resource,resource_id)
   values(p_user,'environment_owner_recovered','staff_roles',p_user::text);
 end if;
end $$;
revoke all on function public.recover_owner_access(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.recover_owner_access(uuid,text,uuid,text) to service_role;
