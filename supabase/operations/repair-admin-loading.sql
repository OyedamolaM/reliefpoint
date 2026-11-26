-- Repair for release 202611250003. Run in the production Supabase SQL Editor.
-- Safe whether that migration was applied or not; preserves customer/order records.
-- Derived from 202611250003_admin_directory_search.sql; no credentials required in this file.
begin;
-- Operational searches are server-only; never expose auth.users or customer addresses publicly.
create index if not exists orders_created_id on public.orders(created_at desc, id);
create index if not exists order_items_order_lookup on public.order_items(order_id);
create index if not exists addresses_customer_lookup on public.addresses(user_id);

create or replace function public.admin_order_records(
 p_resource text, p_query text default '', p_statuses text[] default null,
 p_from timestamptz default null, p_to timestamptz default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_resource not in ('orders','prescriptions','refunds') or p_offset < 0 or p_offset > 240000 then
  raise exception 'INVALID_SEARCH';
 end if;
 with records as (
  select o.id, o.created_at, jsonb_build_object(
   'id',o.id,'reference',o.reference,'contact',o.contact,'total',o.total,
   'payment_status',o.payment_status,'fulfillment_status',o.fulfillment_status,
   'prescription_status',o.prescription_status,'created_at',o.created_at,'test_mode',o.test_mode
  ) as row, o.id as order_id from orders o
  where p_resource='orders' and (p_statuses is null or o.payment_status=any(p_statuses))
  union all
  select p.id,p.created_at,to_jsonb(p)-'path',p.order_id from prescriptions p where p_resource='prescriptions'
  union all
  select r.id,r.created_at,to_jsonb(r),r.order_id from refunds r where p_resource='refunds'
 ), matching as (
  select r.* from records r join orders o on o.id=r.order_id
  where (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<p_to)
  and (coalesce(p_query,'')='' or
    concat_ws(' ',o.reference,o.contact->>'name',o.contact->>'email',o.contact->>'phone',
      o.contact->>'address',o.contact->>'state',o.contact->>'lga') ilike '%'||p_query||'%'
    or exists(select 1 from order_items i where i.order_id=o.id and i.name ilike '%'||p_query||'%'))
  order by r.created_at desc,r.id desc offset p_offset limit 25
 ), numbered as (select *,row_number() over(order by created_at desc,id desc) n from matching)
 select jsonb_build_object('rows',coalesce(jsonb_agg(row order by created_at desc,id desc) filter(where n<=24),'[]'::jsonb),
  'more',count(*)>24) into result from numbered;
 return result;
end $$;

create or replace function public.admin_customer_directory(
 p_query text default '', p_from timestamptz default null, p_to timestamptz default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_offset < 0 or p_offset > 240000 then raise exception 'INVALID_SEARCH'; end if;
 with customers as (
  select p.id,coalesce(nullif(p.name,''),latest.contact->>'name','') name,
   coalesce(nullif(p.phone,''),latest.contact->>'phone','') phone,p.created_at,u.email,u.email_confirmed_at,
   case when latest.contact is null then null else jsonb_build_object('address',latest.contact->>'address',
    'state',latest.zone_snapshot->>'state','lga',latest.zone_snapshot->>'lga') end last_delivery,
   coalesce((select jsonb_agg(a) from (select a.id,a.name,a.phone,a.address,a.state,a.lga
    from addresses a where a.user_id=p.id order by a.id limit 10) a),'[]'::jsonb) addresses
  from profiles p join auth.users u on u.id=p.id
  left join lateral (select o.contact,o.zone_snapshot from orders o where o.user_id=p.id
   and o.payment_status in ('paid','partially_refunded','refunded') order by o.created_at desc,o.id desc limit 1) latest on true
  where (p_from is null or p.created_at>=p_from) and (p_to is null or p.created_at<p_to)
   and (coalesce(p_query,'')='' or concat_ws(' ',p.name,p.phone,u.email) ilike '%'||p_query||'%')
  order by p.created_at desc,p.id desc offset p_offset limit 25
 ), numbered as (select *,row_number() over(order by created_at desc,id desc) n from customers)
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by created_at desc,id desc) filter(where n<=24),'[]'::jsonb),
  'more',count(*)>24) into result from numbered;
 return result;
end $$;

revoke all on function public.admin_order_records(text,text,text[],timestamptz,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.admin_customer_directory(text,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.admin_order_records(text,text,text[],timestamptz,timestamptz,integer) to service_role;
grant execute on function public.admin_customer_directory(text,timestamptz,timestamptz,integer) to service_role;

-- Delivery administration reads the existing delivery table directly.
grant select on public.shipping_zones to service_role;
notify pgrst, 'reload schema';
commit;

-- Read-only. Run in the production project's SQL Editor.
-- Contains no customer records, credentials or auth tokens.
with required_functions(name, signature) as (values
 ('Order search', 'public.admin_order_records(text,text,text[],timestamp with time zone,timestamp with time zone,integer)'),
 ('Customer directory', 'public.admin_customer_directory(text,timestamp with time zone,timestamp with time zone,integer)'),
 ('Dashboard sales', 'public.admin_sales_summary(timestamp with time zone,timestamp with time zone)')
), functions as (
 select name,to_regprocedure(signature) as target from required_functions
), required_tables(name, relation) as (values
 ('Delivery zones','public.shipping_zones'),
 ('Customer profiles','public.profiles'),
 ('Staff access','public.staff_roles'),
 ('Account sessions','public.app_sessions'),
 ('Remembered authenticator','public.mfa_browser_grants')
), tables as (
 select name,to_regclass(relation) as target from required_tables
)
select name, target is not null as exists,
 case when target is null then false else has_function_privilege('service_role',target,'EXECUTE') end as service_access
from functions
union all
select name, target is not null,
 case when target is null then false else has_table_privilege('service_role',target,'SELECT') end
from tables
order by name;

-- Orders / Customers must both show true / true.
-- If missing, apply 202611250003_admin_directory_search.sql once.
-- If the functions exist but the API reports PGRST202, refresh PostgREST's
-- schema cache separately with: NOTIFY pgrst, 'reload schema';
-- For any other error, inspect Vercel logs for event=admin_data_failure.
-- Share only its resource, code and requestId, never credentials or patient data.
