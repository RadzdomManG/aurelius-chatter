alter table public.automation_jobs
  add column if not exists processing_stage text not null default 'queued',
  add column if not exists generated_reply text,
  add column if not exists grok_latency_ms integer,
  add column if not exists fanvue_outgoing_uuid text;

drop index if exists public.automation_active_conversation_idx;
with duplicate_jobs as (
  select id, row_number() over (partition by creator_profile_id, trigger_message_uuid order by created_at, id) as duplicate_number
  from public.automation_jobs
)
delete from public.automation_jobs where id in (select id from duplicate_jobs where duplicate_number > 1);
create unique index if not exists automation_pending_conversation_idx
  on public.automation_jobs (conversation_id) where status = 'pending';
create unique index if not exists automation_trigger_message_idx
  on public.automation_jobs (creator_profile_id, trigger_message_uuid);
create index if not exists automation_running_lock_idx
  on public.automation_jobs (locked_at) where status = 'running';

create table if not exists public.automation_traces (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  automation_job_id uuid references public.automation_jobs(id) on delete cascade,
  trigger_message_uuid text not null,
  event text not null,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists automation_traces_job_time_idx on public.automation_traces (automation_job_id, created_at);
create index if not exists automation_traces_creator_time_idx on public.automation_traces (creator_profile_id, created_at desc);
alter table public.automation_traces enable row level security;
revoke all on table public.automation_traces from anon;
revoke insert, update, delete on table public.automation_traces from authenticated;
grant select on table public.automation_traces to authenticated;
create policy automation_traces_member_read on public.automation_traces for select to authenticated
  using (public.is_org_member(organization_id));

create or replace function public.enqueue_latest_automation_job(
  target_organization_id uuid,
  target_creator_profile_id uuid,
  target_conversation_id uuid,
  target_trigger_message_uuid text,
  debounce_seconds integer default 2
)
returns public.automation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued public.automation_jobs;
begin
  if not exists (
    select 1 from public.conversations
    where id = target_conversation_id
      and organization_id = target_organization_id
      and creator_profile_id = target_creator_profile_id
  ) then
    raise exception 'Conversation does not belong to creator';
  end if;

  update public.automation_jobs
     set status = 'cancelled',
         processing_stage = 'superseded',
         last_error = 'SUPERSEDED_BY_NEWER_FAN_MESSAGE',
         updated_at = now()
   where conversation_id = target_conversation_id
     and status = 'pending'
     and trigger_message_uuid <> target_trigger_message_uuid;

  insert into public.automation_jobs (
    organization_id, creator_profile_id, conversation_id, trigger_message_uuid,
    status, available_at, processing_stage
  ) values (
    target_organization_id, target_creator_profile_id, target_conversation_id,
    target_trigger_message_uuid, 'pending', now() + make_interval(secs => greatest(0, least(debounce_seconds, 10))), 'debouncing'
  )
  on conflict (creator_profile_id, trigger_message_uuid) do update
    set updated_at = public.automation_jobs.updated_at
  returning * into queued;

  insert into public.automation_traces (
    organization_id, creator_profile_id, conversation_id, automation_job_id,
    trigger_message_uuid, event, metadata
  ) values (
    target_organization_id, target_creator_profile_id, target_conversation_id,
    queued.id, target_trigger_message_uuid, 'JOB_CREATED', jsonb_build_object('debounceSeconds', debounce_seconds)
  );

  return queued;
end;
$$;

revoke all on function public.enqueue_latest_automation_job(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_latest_automation_job(uuid, uuid, uuid, text, integer) to service_role;

create or replace function public.claim_automation_job(worker_id text)
returns setof public.automation_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.automation_jobs
  set status = 'running',
      processing_stage = case when status = 'running' then 'stale_lock_recovered' else 'claimed' end,
      locked_at = now(),
      locked_by = worker_id,
      attempts = attempts + 1,
      updated_at = now()
  where id = (
    select id from public.automation_jobs
    where (
      (status = 'pending' and available_at <= now())
      or (status = 'running' and locked_at < now() - interval '2 minutes')
    )
    order by available_at, created_at
    for update skip locked
    limit 1
  )
  returning *;
end;
$$;

revoke all on function public.claim_automation_job(text) from public, anon, authenticated;
grant execute on function public.claim_automation_job(text) to service_role;
