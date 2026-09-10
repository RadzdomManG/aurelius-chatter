import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityEvent =
  | "fan.message.sent"
  | "fan.message.received"
  | "message.stored"
  | "conversation.updated"
  | "automation.job.created"
  | "automation.job.claimed"
  | "persona.loaded"
  | "memory.loaded"
  | "ai.generation.started"
  | "ai.generation.completed"
  | "fanvue.reply.started"
  | "fanvue.reply.sent"
  | "automation.job.completed"
  | "automation.job.failed"
  | "ai.generation.failed"
  | "fanvue.send.failed"
  | "automation.skipped"
  | "fan.paused"
  | "conversation.paused";

export async function logActivity(supabase: SupabaseClient, input: {
  organizationId: string;
  creatorProfileId?: string | null;
  fanId?: string | null;
  conversationId?: string | null;
  automationJobId?: string | null;
  traceId?: string;
  messageUuid?: string | null;
  event: ActivityEvent;
  status?: "info" | "success" | "failed" | "skipped";
  latencyMs?: number | null;
  error?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const { data, error } = await supabase.from("activity_events").insert({
    organization_id: input.organizationId,
    creator_profile_id: input.creatorProfileId ?? null,
    fan_id: input.fanId ?? null,
    conversation_id: input.conversationId ?? null,
    automation_job_id: input.automationJobId ?? null,
    trace_id: input.traceId,
    message_uuid: input.messageUuid ?? null,
    event: input.event,
    status: input.status ?? "info",
    latency_ms: input.latencyMs ?? null,
    error: input.error ?? null,
    metadata: input.metadata ?? {},
  }).select("trace_id").single();
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "ACTIVITY_LOG_FAILED", activityEvent: input.event, error: error.message }));
    return input.traceId ?? null;
  }
  return data.trace_id as string;
}
