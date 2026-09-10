alter table public.automation_jobs add column if not exists trace_id uuid not null default gen_random_uuid();

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles(id) on delete cascade,
  fan_id uuid references public.fans(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  automation_job_id uuid references public.automation_jobs(id) on delete set null,
  trace_id uuid not null default gen_random_uuid(),
  message_uuid text,
  event text not null,
  status text not null check (status in ('info', 'success', 'failed', 'skipped')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_org_time_idx on public.activity_events (organization_id, created_at desc);
create index activity_events_creator_time_idx on public.activity_events (creator_profile_id, created_at desc);
create index activity_events_trace_idx on public.activity_events (trace_id, created_at);
create index activity_events_job_idx on public.activity_events (automation_job_id, created_at);

alter table public.activity_events enable row level security;
revoke all on table public.activity_events from anon;
revoke insert, update, delete on table public.activity_events from authenticated;
grant select on table public.activity_events to authenticated;
create policy activity_events_member_read on public.activity_events for select to authenticated
  using (public.is_org_member(organization_id));

do $$
begin
  alter publication supabase_realtime add table public.activity_events;
exception when duplicate_object then null;
end $$;
