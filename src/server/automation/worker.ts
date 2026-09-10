import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processClaimedAutomationJob } from "@/server/automation/fanvue-auto-reply";

type ClaimedAutomationJob = {
  id: string;
  organization_id: string;
  creator_profile_id: string;
  conversation_id: string;
  trigger_message_uuid: string;
  attempts: number;
};

export async function processAutomationQueue(limit = 3) {
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
      const retryable = job.attempts < 3;
      const retrySeconds = Math.min(300, 5 * (3 ** Math.max(0, job.attempts - 1)));
      await supabase.from("automation_jobs").update({
        status: retryable ? "failed" : "dead_letter",
        last_error: error instanceof Error ? error.message : "Automation worker failed.",
        available_at: retryable ? new Date(Date.now() + retrySeconds * 1000).toISOString() : new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      results.push({ jobId: job.id, status: retryable ? "failed" : "dead_letter", reason: error instanceof Error ? error.message : "Automation worker failed." });
    }
  }

  return { processed: results.length, results };
}
