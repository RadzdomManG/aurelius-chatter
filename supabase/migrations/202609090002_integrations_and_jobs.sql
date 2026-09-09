create table public.fanvue_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  external_user_uuid text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  status text not null default 'healthy' check (status in ('healthy', 'reauth_required', 'disconnected', 'error')),
  last_health_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_profile_id, external_user_uuid)
);

create table public.fanvue_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state_hash text not null unique,
  encrypted_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  creator_profile_id uuid references public.creator_profiles(id) on delete set null,
  external_event_id text not null,
  event_type text not null,
  sanitized_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'dead_letter')),
  retry_count integer not null default 0,
  last_error text,
  unique (external_event_id, event_type)
);

create table public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  trigger_message_uuid text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'dead_letter', 'cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index automation_active_conversation_idx on public.automation_jobs (conversation_id) where status in ('pending', 'running');
create index automation_claim_idx on public.automation_jobs (status, available_at, created_at);
create index webhook_event_status_idx on public.webhook_events (status, received_at desc);

alter table public.fanvue_connections enable row level security;
alter table public.fanvue_oauth_states enable row level security;
alter table public.webhook_events enable row level security;
alter table public.automation_jobs enable row level security;

create policy connection_member_access on public.fanvue_connections for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy oauth_state_member_access on public.fanvue_oauth_states for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy webhook_event_member_access on public.webhook_events for select using (public.is_org_member(organization_id));
create policy automation_job_member_access on public.automation_jobs for select using (public.is_org_member(organization_id));