create table public.persona_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  instructions text not null default '' check (char_length(instructions) <= 12000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_profile_id)
);

create index persona_profiles_org_idx on public.persona_profiles (organization_id);
create index persona_profiles_creator_idx on public.persona_profiles (creator_profile_id);

alter table public.persona_profiles enable row level security;
create policy persona_member_access on public.persona_profiles for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
