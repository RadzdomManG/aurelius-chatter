import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function workspace() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, userId: null, organizationId: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
  return { supabase, userId: userData.user.id, organizationId: membership?.organization_id ?? null };
}

export async function POST(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await context.params;
  const { supabase, userId, organizationId } = await workspace();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const { data: conversation } = await supabase.from("conversations").select("id, fan_id").eq("id", conversationId).eq("organization_id", organizationId).maybeSingle();
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const [{ error: fanError }, { error: conversationError }] = await Promise.all([
    supabase.from("fans").update({ automation_paused: true, updated_at: new Date().toISOString() }).eq("id", conversation.fan_id).eq("organization_id", organizationId),
    supabase.from("conversations").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("organization_id", organizationId),
  ]);
  if (fanError || conversationError) return Response.json({ error: "AI could not be stopped for this fan." }, { status: 503 });
  return Response.json({ paused: true });
}
