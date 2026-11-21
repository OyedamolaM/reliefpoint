alter table public.products add column fts tsvector generated always as(to_tsvector('simple',name||' '||detail||' '||category)) stored;
drop index products_search;
create index products_search on products using gin(fts);
drop view public.catalog;
create view public.catalog with(security_invoker=true) as select p.*, coalesce((select sum(b.quantity-b.reserved) from inventory_batches b where b.product_id=p.id and b.expires_on>current_date),0)::integer as available from products p;
grant select on public.catalog to service_role;
