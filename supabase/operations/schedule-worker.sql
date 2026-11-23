-- Run manually in the linked project's SQL Editor after all migrations.
-- First create these entries using Supabase Vault (never commit their values):
-- reliefpoint_worker_url: https://www.reliefpointpharmacy.com/api/internal/worker
-- reliefpoint_worker_secret: exactly the WORKER_SECRET configured in Vercel.
-- The worker processes queued financial operations and notifications.
begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $check$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into strict worker_url
  from vault.decrypted_secrets where name = 'reliefpoint_worker_url';
  select decrypted_secret into strict worker_secret
  from vault.decrypted_secrets where name = 'reliefpoint_worker_secret';
  if worker_url <> 'https://www.reliefpointpharmacy.com/api/internal/worker' then
    raise exception 'Set reliefpoint_worker_url in Vault to the canonical HTTPS worker endpoint.';
  end if;
  if coalesce(length(worker_secret), 0) < 32 then
    raise exception 'Set reliefpoint_worker_secret in Vault to the Vercel WORKER_SECRET (at least 32 characters).';
  end if;
exception
  when no_data_found then
    raise exception 'Create reliefpoint_worker_url and reliefpoint_worker_secret in Supabase Vault first.';
  when too_many_rows then
    raise exception 'Each ReliefPoint Vault entry must have a unique name.';
end;
$check$;

-- Reusing this name updates the existing job instead of creating duplicates.
select cron.schedule(
  'reliefpoint-worker',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
              where name = 'reliefpoint_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets
           where name = 'reliefpoint_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);

commit;

-- Check after 1-2 minutes. A queued HTTP request alone is not proof of success.
select worker_last_success, checkout_enabled, launch_approved from public.settings;
