alter table public.conversations
  add column if not exists unread_count integer not null default 0 check (unread_count >= 0);

create index if not exists webhook_events_external_lookup_idx
  on public.webhook_events (external_event_id, event_type, received_at desc);

create index if not exists fanvue_connections_creator_lookup_idx
  on public.fanvue_connections (external_user_uuid, status);

create or replace function public.claim_automation_job(worker_id text)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.automation_jobs
  set status = 'running', locked_at = now(), locked_by = worker_id,
      attempts = attempts + 1, updated_at = now()
  where id = (
    select id from public.automation_jobs
    where status = 'pending' and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit 1
  )
  returning *;
end;
$$;

revoke all on function public.claim_automation_job(text) from public;
grant execute on function public.claim_automation_job(text) to service_role;
