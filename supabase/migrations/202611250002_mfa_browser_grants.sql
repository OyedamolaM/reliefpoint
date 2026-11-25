-- Only a server-verified authenticator challenge may create browser trust.
create table public.mfa_browser_grants (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users on delete cascade,
 factor_id uuid not null,
 verified_at timestamptz not null,
 expires_at timestamptz not null,
 check(expires_at > verified_at and expires_at <= verified_at + interval '24 hours')
);
alter table public.mfa_browser_grants enable row level security;
revoke all on public.mfa_browser_grants from public,anon,authenticated;
grant all on public.mfa_browser_grants to service_role;
create index mfa_browser_grants_user on public.mfa_browser_grants(user_id);
create index mfa_browser_grants_expiry on public.mfa_browser_grants(expires_at);
