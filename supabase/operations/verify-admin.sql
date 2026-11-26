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
