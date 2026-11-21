alter table public.blog_posts add column reviewed_at timestamptz;
create function public.approve_post_review(p_post uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not exists(select 1 from staff_roles where user_id=p_actor and role='pharmacist') then raise exception 'FORBIDDEN'; end if;
 update blog_posts set reviewer_name=(select name from profiles where id=p_actor),reviewed_at=now() where id=p_post and reviewer_id=p_actor;
 if not found then raise exception 'FORBIDDEN'; end if;
end $$;
revoke execute on function public.approve_post_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_post_review(uuid,uuid) to service_role;
