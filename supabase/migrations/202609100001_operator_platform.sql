create table if not exists public.bot_action_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  fan_id uuid references public.fans(id) on delete set null,
  action_type text not null,
  status text not null default 'completed' check (status in ('queued', 'completed', 'failed')),
  provider text not null default 'fanvue',
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_cents numeric(12,4) not null default 0,
  revenue_cents integer not null default 0,
  external_uuid text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles(id) on delete cascade,
  enabled boolean not null default false,
  approval_required boolean not null default true,
  quiet_hours_start text,
  quiet_hours_end text,
  max_replies_per_hour integer not null default 20 check (max_replies_per_hour between 1 and 500),
  min_confidence numeric(3,2) not null default 0.75 check (min_confidence >= 0 and min_confidence <= 1),
  ppv_allowed boolean not null default false,
  max_ppv_cents integer not null default 50000 check (max_ppv_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, creator_profile_id)
);

create table if not exists public.scheduled_operator_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles(id) on delete set null,
  action_type text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  external_uuid text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fanvue_media_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles(id) on delete cascade,
  external_uuid text not null,
  name text,
  media_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, creator_profile_id, external_uuid)
);

create index if not exists bot_action_logs_org_created_idx on public.bot_action_logs (organization_id, created_at desc);
create index if not exists bot_action_logs_external_idx on public.bot_action_logs (organization_id, external_uuid);
create index if not exists scheduled_operator_actions_org_time_idx on public.scheduled_operator_actions (organization_id, scheduled_at desc);
create index if not exists fanvue_media_cache_org_creator_idx on public.fanvue_media_cache (organization_id, creator_profile_id, updated_at desc);

alter table public.bot_action_logs enable row level security;
alter table public.automation_settings enable row level security;
alter table public.scheduled_operator_actions enable row level security;
alter table public.fanvue_media_cache enable row level security;

drop policy if exists bot_action_logs_member_access on public.bot_action_logs;
create policy bot_action_logs_member_access on public.bot_action_logs for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists automation_settings_member_access on public.automation_settings;
create policy automation_settings_member_access on public.automation_settings for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists scheduled_operator_actions_member_access on public.scheduled_operator_actions;
create policy scheduled_operator_actions_member_access on public.scheduled_operator_actions for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists fanvue_media_cache_member_access on public.fanvue_media_cache;
create policy fanvue_media_cache_member_access on public.fanvue_media_cache for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists automation_job_member_update on public.automation_jobs;
create policy automation_job_member_update on public.automation_jobs for update
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));
