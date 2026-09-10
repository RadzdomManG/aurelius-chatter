import { workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

  const { data: creator } = await supabase.from("creator_profiles").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!creator) return Response.json({ error: "Model not found." }, { status: 404 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.section !== "persona" && body.section !== "automation")) return Response.json({ error: "Invalid model update." }, { status: 400 });

  if (body.section === "persona") {
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    if (!displayName || displayName.length > 120 || instructions.length > 12000) return Response.json({ error: "Persona values are invalid." }, { status: 400 });
    const { data: savedPersona, error } = await supabase.from("persona_profiles").update({ display_name: displayName, instructions, active: body.active !== false, updated_at: new Date().toISOString() }).eq("creator_profile_id", id).eq("organization_id", organizationId).select("id, display_name, instructions, active").maybeSingle();
    if (error || !savedPersona) return Response.json({ error: "Persona could not be saved." }, { status: 400 });
    return Response.json({ saved: true, persona: savedPersona });
  }

  const automationMode = ["off", "draft", "auto_safe", "full_auto"].includes(String(body.automationMode)) ? String(body.automationMode) : "draft";
  const maxRepliesPerHour = Math.min(500, Math.max(1, Number(body.maxRepliesPerHour ?? 20)));
  const minConfidence = Math.min(1, Math.max(0, Number(body.minConfidence ?? 0.75)));
  const maxPpvCents = Math.max(0, Number(body.maxPpvCents ?? 50000));
  const settings = { organization_id: organizationId, creator_profile_id: id, enabled: body.enabled !== false && automationMode !== "off", approval_required: Boolean(body.approvalRequired), quiet_hours_start: typeof body.quietHoursStart === "string" ? body.quietHoursStart : null, quiet_hours_end: typeof body.quietHoursEnd === "string" ? body.quietHoursEnd : null, max_replies_per_hour: maxRepliesPerHour, min_confidence: minConfidence, ppv_allowed: Boolean(body.ppvAllowed), max_ppv_cents: maxPpvCents, updated_at: new Date().toISOString() };
  const { data: existing } = await supabase.from("automation_settings").select("id").eq("organization_id", organizationId).eq("creator_profile_id", id).maybeSingle();
  const { error: settingsError } = existing?.id ? await supabase.from("automation_settings").update(settings).eq("id", existing.id).eq("organization_id", organizationId) : await supabase.from("automation_settings").insert(settings);
  if (settingsError) return Response.json({ error: "Automation settings could not be saved." }, { status: 400 });
  const { error: creatorError } = await supabase.from("creator_profiles").update({ automation_mode: automationMode, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", organizationId);
  if (creatorError) return Response.json({ error: "Automation mode could not be saved." }, { status: 400 });
  const [{ data: savedCreator }, { data: savedSettings }] = await Promise.all([
    supabase.from("creator_profiles").select("automation_mode").eq("id", id).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("automation_settings").select("enabled, approval_required, quiet_hours_start, quiet_hours_end, max_replies_per_hour, min_confidence, ppv_allowed, max_ppv_cents").eq("organization_id", organizationId).eq("creator_profile_id", id).maybeSingle(),
  ]);
  return Response.json({ saved: true, automationMode: savedCreator?.automation_mode, settings: savedSettings });
}
