import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/server/fanvue/encryption";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return Response.json({ error: "Fanvue authorization was declined.", code: error }, { status: 400 });
  if (!code || !state) return Response.json({ error: "Missing OAuth callback parameters." }, { status: 400 });
  const cookieStore = await cookies();
  const storedValue = cookieStore.get("aurelius_fanvue_oauth")?.value;
  if (!storedValue) return Response.json({ error: "OAuth session expired. Please reconnect Fanvue." }, { status: 400 });
  let stored: { state: string; verifier: string; organizationId: string; creatorProfileId: string };
  try { stored = JSON.parse(storedValue) as { state: string; verifier: string; organizationId: string; creatorProfileId: string }; } catch { return Response.json({ error: "Invalid OAuth session." }, { status: 400 }); }
  cookieStore.delete("aurelius_fanvue_oauth");
  if (stored.state !== state) return Response.json({ error: "Invalid OAuth state." }, { status: 400 });
  const env = serverEnv();
  const headers: HeadersInit = { "Content-Type": "application/x-www-form-urlencoded" };
  if (env.fanvueClientSecret) headers.Authorization = `Basic ${Buffer.from(`${env.fanvueClientId}:${env.fanvueClientSecret}`).toString("base64")}`;
  const tokenResponse = await fetch("https://auth.fanvue.com/oauth2/token", { method: "POST", headers, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.fanvueRedirectUri, code_verifier: stored.verifier }) });
  if (!tokenResponse.ok) return Response.json({ error: "Fanvue token exchange failed." }, { status: 502 });
  const tokenPayload = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokenPayload.access_token || !tokenPayload.refresh_token) return Response.json({ error: "Fanvue did not return the required tokens." }, { status: 502 });
  const identityResponse = await fetch(`${env.fanvueApiBaseUrl}/users/me`, { headers: { Authorization: `Bearer ${tokenPayload.access_token}`, "X-Fanvue-API-Version": env.fanvueApiVersion } });
  if (!identityResponse.ok) return Response.json({ error: "Fanvue authorization succeeded, but creator identity could not be verified." }, { status: 502 });
  const identity = await identityResponse.json() as { uuid?: string };
  if (!identity.uuid) return Response.json({ error: "Fanvue did not return a creator identity." }, { status: 502 });
  const supabase = createSupabaseAdminClient();
  const { error: connectionError } = await supabase.from("fanvue_connections").upsert({ organization_id: stored.organizationId, creator_profile_id: stored.creatorProfileId, external_user_uuid: identity.uuid, encrypted_access_token: encryptToken(tokenPayload.access_token), encrypted_refresh_token: encryptToken(tokenPayload.refresh_token), access_token_expires_at: new Date(Date.now() + (tokenPayload.expires_in ?? 3600) * 1000).toISOString(), granted_scopes: tokenPayload.scope?.split(" ").filter(Boolean) ?? [], status: "healthy", updated_at: new Date().toISOString() }, { onConflict: "creator_profile_id,external_user_uuid" });
  if (connectionError) return Response.json({ error: "Fanvue connected but secure connection storage failed." }, { status: 503 });
  return Response.redirect(new URL("/integrations?fanvue=connected", request.url));
}