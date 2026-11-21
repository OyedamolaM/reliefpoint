alter table public.profiles add column sessions_revoked_at timestamptz;
create function public.create_customer_profile() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into profiles(id,name) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),100)) on conflict(id) do nothing;
 return new;
end $$;
create trigger customer_profile after insert on auth.users for each row execute function public.create_customer_profile();
revoke execute on function public.create_customer_profile() from public,anon,authenticated;
alter table public.payments add column next_check_at timestamptz not null default now();
create index payments_reconciliation on public.payments(provider_status,next_check_at);
