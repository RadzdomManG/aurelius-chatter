revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
revoke all on function public.claim_automation_job(text) from public, anon, authenticated;
grant execute on function public.claim_automation_job(text) to service_role;

create index if not exists automation_jobs_organization_idx on public.automation_jobs (organization_id);
create index if not exists automation_jobs_creator_idx on public.automation_jobs (creator_profile_id);
create index if not exists conversation_summaries_creator_idx on public.conversation_summaries (creator_profile_id);
create index if not exists conversations_fan_idx on public.conversations (fan_id);
create index if not exists fan_memories_fan_idx on public.fan_memories (fan_id);
create index if not exists fanvue_connections_organization_idx on public.fanvue_connections (organization_id);
create index if not exists fanvue_oauth_states_organization_idx on public.fanvue_oauth_states (organization_id);
create index if not exists memory_audit_logs_memory_idx on public.memory_audit_logs (fan_memory_id);
create index if not exists memory_audit_logs_organization_idx on public.memory_audit_logs (organization_id);
create index if not exists memory_audit_logs_performed_by_idx on public.memory_audit_logs (performed_by);
create index if not exists messages_organization_idx on public.messages (organization_id);
create index if not exists organization_members_user_idx on public.organization_members (user_id);
create index if not exists webhook_events_creator_idx on public.webhook_events (creator_profile_id);
create index if not exists webhook_events_organization_idx on public.webhook_events (organization_id);
