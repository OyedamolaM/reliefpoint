-- Partial words match names, categories, brands and product details (including ingredients).
create function public.search_catalog(p_query text, p_category text default 'All', p_max bigint default null,
 p_stock boolean default false, p_deals boolean default false, p_sort text default 'featured', p_page integer default 0)
returns setof public.catalog language sql stable security invoker set search_path=public,pg_temp as $$
 select c.* from catalog c
 where c.active and (p_category='All' or c.category=p_category)
 and (p_max is null or c.price_kobo<=p_max)
 and (not p_stock or c.available>0) and (not p_deals or c.deal)
 and not exists (
   select 1 from regexp_split_to_table(lower(left(trim(p_query),100)), '\s+') word
   where word<>'' and strpos(lower(c.name||' '||c.category||' '||c.brand||' '||c.detail),word)=0
 )
 order by
 case when p_sort='featured' then
   case when lower(c.name)=lower(trim(p_query)) then 0
        when strpos(lower(c.name),lower(trim(p_query)))=1 then 1
        when strpos(lower(c.name),lower(trim(p_query)))>0 then 2
        else 3 end end,
 case when p_sort='price-low' then c.price_kobo end asc,
 case when p_sort='price-high' then c.price_kobo end desc,
 case when p_sort='name' then c.name end asc,
 c.deal desc,c.name,c.id
 limit 21 offset greatest(0,least(10000,p_page))*20;
$$;
revoke all on function public.search_catalog(text,text,bigint,boolean,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.search_catalog(text,text,bigint,boolean,boolean,text,integer) to service_role;
