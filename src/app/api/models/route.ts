import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function workspace() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, userId: null, organizationId: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", userData.user.id).limit(1).maybeSingle();
  return { supabase, userId: userData.user.id, organizationId: membership?.organization_id ?? null };
}

export async function GET() {
  const { supabase, userId, organizationId } = await workspace();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const { data, error } = await supabase.from("creator_profiles").select("id, display_name, timezone, automation_mode, persona_profiles(id, display_name, active), fanvue_connections(status)").eq("organization_id", organizationId).order("created_at");
  if (error) return Response.json({ error: "Models could not be loaded." }, { status: 503 });
  return Response.json({ models: data });
}

export async function POST(request: Request) {
  const { supabase, userId, organizationId } = await workspace();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const body = await request.json() as { displayName?: string; personaName?: string; instructions?: string };
  const displayName = body.displayName?.trim();
  const personaName = body.personaName?.trim() || displayName;
  if (!displayName || !personaName) return Response.json({ error: "Model and persona names are required." }, { status: 400 });
  const { data: model, error: modelError } = await supabase.from("creator_profiles").insert({ organization_id: organizationId, display_name: displayName }).select("id, display_name, timezone, automation_mode").single();
  if (modelError || !model) return Response.json({ error: "Model could not be created." }, { status: 400 });
  const { error: personaError } = await supabase.from("persona_profiles").insert({ organization_id: organizationId, creator_profile_id: model.id, display_name: personaName, instructions: body.instructions?.trim() ?? "" });
  if (personaError) {
    await supabase.from("creator_profiles").delete().eq("id", model.id).eq("organization_id", organizationId);
    return Response.json({ error: "Persona could not be created." }, { status: 400 });
  }
  return Response.json({ model }, { status: 201 });
}
