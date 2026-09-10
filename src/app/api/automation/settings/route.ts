import { workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

const defaults = {
  enabled: true,
  approvalRequired: false,
  quietHoursStart: "",
  quietHoursEnd: "",
  maxRepliesPerHour: 20,
  minConfidence: 0,
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
  const mode = body?.mode === "start_all" ? "start_all" : body?.mode === "stop_all" ? "stop_all" : null;
  const maxRepliesPerHour = Math.min(500, Math.max(1, Number(body?.maxRepliesPerHour ?? defaults.maxRepliesPerHour)));
  const minConfidence = Math.min(1, Math.max(0, Number(body?.minConfidence ?? defaults.minConfidence)));
  const maxPpvCents = Math.max(0, Number(body?.maxPpvCents ?? defaults.maxPpvCents));
  const payload = {
    organization_id: organizationId,
    creator_profile_id: null,
    enabled: mode ? mode === "start_all" : body?.enabled !== false,
    approval_required: mode ? false : Boolean(body?.approvalRequired),
    quiet_hours_start: typeof body?.quietHoursStart === "string" ? body.quietHoursStart : defaults.quietHoursStart,
    quiet_hours_end: typeof body?.quietHoursEnd === "string" ? body.quietHoursEnd : defaults.quietHoursEnd,
    max_replies_per_hour: maxRepliesPerHour,
    min_confidence: minConfidence,
    ppv_allowed: Boolean(body?.ppvAllowed),
    max_ppv_cents: maxPpvCents,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from("automation_settings").select("id").eq("organization_id", organizationId).is("creator_profile_id", null).limit(1).maybeSingle();
  const { error } = existing?.id
    ? await supabase.from("automation_settings").update(payload).eq("id", existing.id).eq("organization_id", organizationId)
    : await supabase.from("automation_settings").insert(payload);
  if (error) return Response.json({ error: "Automation settings table is not ready yet. Apply the latest Supabase migration first." }, { status: 409 });
  return Response.json({ saved: true, enabled: payload.enabled });
}
