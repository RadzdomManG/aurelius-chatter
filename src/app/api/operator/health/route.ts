import { workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

  const [connection, latestMessage, latestWebhook, pendingJobs, failedJobs, runningJobs, completedJobs] = await Promise.all([
    supabase.from("fanvue_connections").select("status, updated_at, access_token_expires_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("messages").select("sender_type, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("webhook_events").select("event_type, status, received_at, processed_at, last_error").eq("organization_id", organizationId).order("received_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["failed", "dead_letter"]),
    supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "running"),
    supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "completed"),
  ]);

  return Response.json({
    fanvue: {
      connected: connection.data?.status === "healthy",
      status: connection.data?.status ?? "not_connected",
      updatedAt: connection.data?.updated_at ?? null,
      tokenExpiresAt: connection.data?.access_token_expires_at ?? null,
    },
    latestMessage: latestMessage.data ? {
      senderType: latestMessage.data.sender_type,
      createdAt: latestMessage.data.created_at,
    } : null,
    latestWebhook: latestWebhook.data ? {
      eventType: latestWebhook.data.event_type,
      status: latestWebhook.data.status,
      receivedAt: latestWebhook.data.received_at,
      processedAt: latestWebhook.data.processed_at,
      lastError: latestWebhook.data.last_error,
    } : null,
    queue: {
      pending: pendingJobs.count ?? 0,
      running: runningJobs.count ?? 0,
      failed: failedJobs.count ?? 0,
      completed: completedJobs.count ?? 0,
    },
  });
}
