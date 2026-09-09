import { cookies } from "next/headers";
import { createOAuthState, createPkcePair } from "@/server/fanvue/pkce";
import { fanvueAuthorizationUrl } from "@/server/fanvue/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const defaultScopes = ["openid", "offline_access", "offline", "read:self", "read:chat", "write:chat"];

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return Response.json({ error: "Sign in before connecting Fanvue." }, { status: 401 });
  const creatorProfileId = new URL(request.url).searchParams.get("creatorProfileId");
  if (!creatorProfileId) return Response.json({ error: "Choose a model before connecting Fanvue." }, { status: 400 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
  if (!membership?.organization_id) return Response.json({ error: "Create or join a workspace before connecting Fanvue." }, { status: 403 });
  const { data: creator } = await supabase.from("creator_profiles").select("id").eq("id", creatorProfileId).eq("organization_id", membership.organization_id).maybeSingle();
  if (!creator) return Response.json({ error: "That model is not available in your workspace." }, { status: 404 });
  const state = createOAuthState();
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  cookieStore.set("aurelius_fanvue_oauth", JSON.stringify({ state, verifier, organizationId: membership.organization_id, creatorProfileId }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/fanvue/oauth", maxAge: 600 });
  return Response.redirect(fanvueAuthorizationUrl(state, challenge, process.env.FANVUE_SCOPES?.split(" ").filter(Boolean) ?? defaultScopes));
}