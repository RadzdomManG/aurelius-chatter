create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'admin', 'manager', 'human_chatter', 'viewer');
create type public.memory_category as enum ('identity', 'preference', 'relationship', 'interest', 'boundary', 'sales', 'support', 'conversation');
create type public.memory_status as enum ('confirmed', 'inferred', 'outdated', 'invalidated', 'deleted');
create type public.memory_sensitivity as enum ('normal', 'sensitive', 'restricted');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  memory_collection_paused boolean not null default false,
  memory_retention_days integer not null default 730 check (memory_retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  fanvue_user_uuid text,
  timezone text not null default 'UTC',
  automation_mode text not null default 'draft' check (automation_mode in ('off', 'draft', 'auto_safe', 'full_auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fanvue_user_uuid)
);

create table public.fans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  external_uuid text not null,
  display_name text,
  handle text,
  subscription_status text,
  adult_status_confirmed boolean not null default false,
  automation_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_profile_id, external_uuid)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  fan_id uuid not null references public.fans(id) on delete cascade,
  status text not null default 'ai_active' check (status in ('ai_active', 'paused', 'human_controlled', 'blocked')),
  rolling_stage text not null default 'new',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_profile_id, fan_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_uuid text not null,
  sender_type text not null check (sender_type in ('fan', 'creator', 'system')),
  body text not null check (char_length(body) <= 5000),
  created_at timestamptz not null,
  unique (creator_profile_id, external_uuid)
);

create table public.fan_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  fan_id uuid not null references public.fans(id) on delete cascade,
  category public.memory_category not null,
  memory_key text not null check (char_length(memory_key) between 1 and 120),
  normalized_memory_key text generated always as (lower(regexp_replace(trim(memory_key), '[^a-zA-Z0-9]+', '-', 'g'))) stored,
  memory_value text not null check (char_length(memory_value) between 1 and 1000),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  status public.memory_status not null default 'inferred',
  sensitivity public.memory_sensitivity not null default 'normal',
  source_message_uuid text,
  first_observed_at timestamptz not null default now(),
  last_confirmed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_profile_id, fan_id, category, normalized_memory_key)
);

create table public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  summary text not null default '',
  unresolved_items jsonb not null default '[]'::jsonb,
  last_summarized_message_uuid text,
  messages_included integer not null default 0,
  summary_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id)
);

create table public.memory_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fan_memory_id uuid references public.fan_memories(id) on delete set null,
  action text not null check (action in ('create', 'update', 'confirm', 'invalidate', 'delete', 'restore', 'export')),
  previous_value text,
  new_value text,
  source text not null,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index fans_lookup_idx on public.fans (organization_id, creator_profile_id, external_uuid);
create index conversations_recent_idx on public.conversations (organization_id, creator_profile_id, updated_at desc);
create index messages_conversation_time_idx on public.messages (conversation_id, created_at desc);
create index memories_fan_status_idx on public.fan_memories (organization_id, creator_profile_id, fan_id, status);
create index memories_search_idx on public.fan_memories using gin (to_tsvector('simple', memory_key || ' ' || memory_value));
create index summaries_conversation_idx on public.conversation_summaries (organization_id, creator_profile_id, conversation_id);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org and user_id = auth.uid());
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.fans enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.fan_memories enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.memory_audit_logs enable row level security;

create policy org_member_read on public.organizations for select using (public.is_org_member(id));
create policy membership_read on public.organization_members for select using (public.is_org_member(organization_id));
create policy creator_member_access on public.creator_profiles for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy fan_member_access on public.fans for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy conversation_member_access on public.conversations for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy message_member_access on public.messages for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy memory_member_access on public.fan_memories for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy summary_member_access on public.conversation_summaries for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy memory_audit_member_access on public.memory_audit_logs for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));