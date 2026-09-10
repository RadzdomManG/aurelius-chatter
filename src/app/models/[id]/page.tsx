import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ModelWorkspace from "./workspace";

export const runtime = "nodejs";

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) notFound();
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
  if (!membership?.organization_id) notFound();
  const organizationId = membership.organization_id;
  const [creatorResult, settingsResult, conversationResult, memoryResult, pendingResult, failedResult, latestJobResult, oldestPendingResult, lastIncomingResult, lastGenerationResult, lastSendResult, failedRowsResult, tracesResult] = await Promise.all([
    supabase.from("creator_profiles").select("id, display_name, fanvue_user_uuid, timezone, automation_mode, persona_profiles(id, display_name, instructions, active), fanvue_connections(id, external_user_uuid, status, access_token_expires_at, last_health_check_at, updated_at)").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("automation_settings").select("enabled, approval_required, quiet_hours_start, quiet_hours_end, max_replies_per_hour, min_confidence, ppv_allowed, max_ppv_cents").eq("organization_id", organizationId).eq("creator_profile_id", id).maybeSingle(),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("creator_profile_id", id),
    supabase.from("fan_memories").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("creator_profile_id", id).neq("status", "deleted"),
    supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("creator_profile_id", id).in("status", ["pending", "running"]),
    supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("creator_profile_id", id).in("status", ["failed", "dead_letter"]),
    supabase.from("automation_jobs").select("status, updated_at").eq("organization_id", organizationId).eq("creator_profile_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("automation_jobs").select("created_at").eq("organization_id", organizationId).eq("creator_profile_id", id).eq("status", "pending").order("created_at").limit(1).maybeSingle(),
    supabase.from("messages").select("created_at").eq("organization_id", organizationId).eq("creator_profile_id", id).eq("sender_type", "fan").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("automation_jobs").select("updated_at, grok_latency_ms").eq("organization_id", organizationId).eq("creator_profile_id", id).not("grok_latency_ms", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("bot_action_logs").select("created_at").eq("organization_id", organizationId).eq("creator_profile_id", id).eq("action_type", "message_send").eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("automation_jobs").select("id, conversation_id, processing_stage, last_error, attempts, created_at").eq("organization_id", organizationId).eq("creator_profile_id", id).in("status", ["failed", "dead_letter"]).order("created_at", { ascending: false }).limit(10),
    supabase.from("automation_traces").select("id, automation_job_id, event, duration_ms, created_at").eq("organization_id", organizationId).eq("creator_profile_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!creatorResult.data) notFound();
  const personas = Array.isArray(creatorResult.data.persona_profiles) ? creatorResult.data.persona_profiles : creatorResult.data.persona_profiles ? [creatorResult.data.persona_profiles] : [];
  const connections = Array.isArray(creatorResult.data.fanvue_connections) ? creatorResult.data.fanvue_connections : creatorResult.data.fanvue_connections ? [creatorResult.data.fanvue_connections] : [];
  return <main className="workspace-page"><Link className="workspace-back" href="/models"><ArrowLeft size={15} /> Back to models</Link><ModelWorkspace initial={{ creator: { id: creatorResult.data.id, displayName: creatorResult.data.display_name, fanvueUserUuid: creatorResult.data.fanvue_user_uuid, timezone: creatorResult.data.timezone, automationMode: creatorResult.data.automation_mode }, persona: personas.find((persona) => persona.active) ?? personas[0] ?? null, connection: connections[0] ?? null, automation: settingsResult.data, counts: { conversations: conversationResult.count ?? 0, memories: memoryResult.count ?? 0, pendingJobs: pendingResult.count ?? 0, failedJobs: failedResult.count ?? 0 }, latestJob: latestJobResult.data, diagnostics: { oldestPendingAt: oldestPendingResult.data?.created_at ?? null, lastIncomingAt: lastIncomingResult.data?.created_at ?? null, lastGenerationAt: lastGenerationResult.data?.updated_at ?? null, lastGrokLatencyMs: lastGenerationResult.data?.grok_latency_ms ?? null, lastSendAt: lastSendResult.data?.created_at ?? null }, failedJobs: failedRowsResult.data ?? [], traces: tracesResult.data ?? [] }} /></main>;
}
