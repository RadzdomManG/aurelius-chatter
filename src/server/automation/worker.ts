import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processClaimedAutomationJob } from "@/server/automation/fanvue-auto-reply";
import { XaiProviderError } from "@/server/ai/xai";
import { FanvueApiError } from "@/server/fanvue/client";
import { logActivity } from "@/server/activity/log";

type ClaimedAutomationJob = {
  id: string;
  organization_id: string;
  creator_profile_id: string;
  conversation_id: string;
  trigger_message_uuid: string;
  attempts: number;
  trace_id: string;
};

export async function processAutomationQueue(limit = 3) {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();
  const workerId = `vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const results: Array<{ jobId: string; status: string; reason?: string }> = [];

  for (let index = 0; index < limit; index += 1) {
    const { data: claimed, error } = await supabase.rpc("claim_automation_job", { worker_id: workerId });
    if (error) throw error;
    const job = (claimed?.[0] ?? null) as ClaimedAutomationJob | null;
    if (!job) break;
    try {
      const result = await processClaimedAutomationJob(supabase, job);
      results.push({ jobId: job.id, status: result.status, reason: "reason" in result ? result.reason : undefined });
    } catch (error) {
      const temporaryProviderError = (error instanceof XaiProviderError && error.retryable) || (error instanceof FanvueApiError && [429, 500, 502, 503, 504].includes(error.status)) || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
      const retryable = temporaryProviderError && job.attempts < 3;
      const retrySeconds = Math.min(300, 5 * (3 ** Math.max(0, job.attempts - 1)));
      await supabase.from("automation_jobs").update({
        status: retryable ? "pending" : job.attempts >= 3 ? "dead_letter" : "failed",
        processing_stage: retryable ? "retry_scheduled" : "failed",
        last_error: error instanceof Error ? error.message : "Automation worker failed.",
        available_at: retryable ? new Date(Date.now() + retrySeconds * 1000).toISOString() : new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      await logActivity(supabase, { organizationId: job.organization_id, creatorProfileId: job.creator_profile_id, conversationId: job.conversation_id, automationJobId: job.id, traceId: job.trace_id, messageUuid: job.trigger_message_uuid, event: "automation.job.failed", status: "failed", error: error instanceof Error ? error.message : "Automation worker failed." });
      results.push({ jobId: job.id, status: retryable ? "pending" : job.attempts >= 3 ? "dead_letter" : "failed", reason: error instanceof Error ? error.message : "Automation worker failed." });
    }
  }

  console.log(JSON.stringify({ level: "info", event: "AUTOMATION_WORKER_COMPLETED", workerId, processed: results.length, durationMs: Date.now() - startedAt }));
  return { processed: results.length, results };
}
