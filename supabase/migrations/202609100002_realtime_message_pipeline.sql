do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.automation_jobs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.webhook_events;
exception when duplicate_object then null;
end $$;

create or replace function public.claim_automation_job(worker_id text)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.automation_jobs
  set status = 'running',
      locked_at = now(),
      locked_by = worker_id,
      attempts = attempts + 1,
      updated_at = now()
  where id = (
    select id from public.automation_jobs
    where (
      status = 'pending'
      or (status = 'running' and locked_at < now() - interval '2 minutes')
      or (status = 'failed' and attempts < 3 and available_at <= now())
    )
    and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit 1
  )
  returning *;
end;
$$;

revoke all on function public.claim_automation_job(text) from public, anon, authenticated;
grant execute on function public.claim_automation_job(text) to service_role;
