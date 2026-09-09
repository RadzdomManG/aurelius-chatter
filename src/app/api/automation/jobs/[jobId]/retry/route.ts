import { workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const { data: job } = await supabase.from("automation_jobs").select("id, status").eq("id", jobId).eq("organization_id", organizationId).maybeSingle();
  if (!job) return Response.json({ error: "Retry job not found." }, { status: 404 });
  if (!["failed", "dead_letter"].includes(job.status)) return Response.json({ error: "Only failed jobs can be retried." }, { status: 400 });
  const { error } = await supabase.from("automation_jobs").update({ status: "pending", attempts: 0, available_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("organization_id", organizationId);
  if (error) return Response.json({ error: "Retry could not be queued." }, { status: 500 });
  return Response.json({ queued: true });
}
