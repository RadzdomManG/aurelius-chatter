import { workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

const defaults = {
  enabled: false,
  approvalRequired: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  maxRepliesPerHour: 20,
  minConfidence: 0.75,
  ppvAllowed: false,
  maxPpvCents: 50000,
};

export async function GET() {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const { data, error } = await supabase.from("automation_settings").select("*").eq("organization_id", organizationId).is("creator_profile_id", null).maybeSingle();
  if (error) return Response.json({ settings: defaults, migrationRequired: true });
  return Response.json({ settings: data ? {
    enabled: data.enabled,
    approvalRequired: data.approval_required,
    quietHoursStart: data.quiet_hours_start ?? defaults.quietHoursStart,
    quietHoursEnd: data.quiet_hours_end ?? defaults.quietHoursEnd,
    maxRepliesPerHour: data.max_replies_per_hour,
    minConfidence: Number(data.min_confidence),
    ppvAllowed: data.ppv_allowed,
    maxPpvCents: data.max_ppv_cents,
  } : defaults });
}

export async function POST(request: Request) {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const maxRepliesPerHour = Math.min(500, Math.max(1, Number(body?.maxRepliesPerHour ?? defaults.maxRepliesPerHour)));
  const minConfidence = Math.min(1, Math.max(0, Number(body?.minConfidence ?? defaults.minConfidence)));
  const maxPpvCents = Math.max(0, Number(body?.maxPpvCents ?? defaults.maxPpvCents));
  const payload = {
    organization_id: organizationId,
    creator_profile_id: null,
    enabled: Boolean(body?.enabled),
    approval_required: body?.approvalRequired !== false,
    quiet_hours_start: typeof body?.quietHoursStart === "string" ? body.quietHoursStart : defaults.quietHoursStart,
    quiet_hours_end: typeof body?.quietHoursEnd === "string" ? body.quietHoursEnd : defaults.quietHoursEnd,
    max_replies_per_hour: maxRepliesPerHour,
    min_confidence: minConfidence,
    ppv_allowed: Boolean(body?.ppvAllowed),
    max_ppv_cents: maxPpvCents,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("automation_settings").upsert(payload, { onConflict: "organization_id,creator_profile_id" });
  if (error) return Response.json({ error: "Automation settings table is not ready yet. Apply the latest Supabase migration first." }, { status: 409 });
  return Response.json({ saved: true });
}
