create table public.upload_tickets(id uuid primary key default gen_random_uuid(),path text unique not null,owner_key text not null,kind text not null check(kind in ('media','prescription')),order_id uuid references orders,size integer not null check(size>0 and size<=10485760),mime text not null,used boolean not null default false,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes');
alter table public.upload_tickets enable row level security;
revoke all on public.upload_tickets from anon,authenticated;
grant all on public.upload_tickets to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('upload-quarantine','upload-quarantine',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
