-- Copy signup contact details into the private customer profile.
create or replace function public.create_customer_profile() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into profiles(id,name,phone)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),100),
   case when coalesce(new.raw_user_meta_data->>'phone','') ~ '^(0|\+?234)[789][0-9]{9}$'
     then new.raw_user_meta_data->>'phone' else '' end)
 on conflict(id) do nothing;
 return new;
end $$;
revoke execute on function public.create_customer_profile() from public,anon,authenticated;
