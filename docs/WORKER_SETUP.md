# Background worker setup

Run this once after applying the database migrations. It does not require an application deployment. Leave live checkout disabled until provider tests and launch approvals are complete.

1. Open the ReliefPoint Supabase project's **Vault** screen.
2. Add `reliefpoint_worker_url` with value `https://www.reliefpointpharmacy.com/api/internal/worker`.
3. Add `reliefpoint_worker_secret` with exactly the same value as the deployed Vercel `WORKER_SECRET`. If the original value is unavailable, generate a new one, update Vercel and redeploy, then put the same new value in Vault. Do not send it in chat or put it in a SQL file.
4. Run `supabase/operations/schedule-worker.sql` in Supabase SQL Editor as the project administrator. It schedules one authenticated POST every minute, referencing Vault entries rather than embedding credentials in the job.
5. After one or two minutes, run:

```sql
select worker_last_success, checkout_enabled, launch_approved
from public.settings;

select j.jobname, r.status, r.start_time, r.end_time
from cron.job j
join cron.job_run_details r on r.jobid = j.jobid
where j.jobname = 'reliefpoint-worker'
order by r.start_time desc
limit 5;

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 10;
```

`worker_last_success` must advance and the HTTP response must be successful. A successful Cron run only means the HTTP request was queued. HTTP 401 means the Vault secret does not match the deployed secret; HTTP 503 requires checking application/database configuration. Investigate missing worker heartbeats rather than enabling checkout.

To pause only this job:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'reliefpoint-worker';
```

To resume it, use the same statement with `active := true`. Do not disable the entire pg_cron extension: that would affect unrelated jobs.

References: [Supabase scheduling with Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
