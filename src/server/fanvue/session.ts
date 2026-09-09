import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { decryptToken, encryptToken } from "@/server/fanvue/encryption";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type FanvueConnection = {
  id: string;
  creator_profile_id: string;
  external_user_uuid: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
};

export async function workspaceSession() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, userId: null, organizationId: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
  return { supabase, userId: userData.user.id, organizationId: membership?.organization_id ?? null };
}

export async function accessTokenForFanvue(supabase: SupabaseServerClient, connection: FanvueConnection) {
  if (new Date(connection.access_token_expires_at).getTime() > Date.now() + 300_000) return decryptToken(connection.encrypted_access_token);
  const env = serverEnv();
  const headers: HeadersInit = { "Content-Type": "application/x-www-form-urlencoded" };
  if (env.fanvueClientSecret) headers.Authorization = `Basic ${Buffer.from(`${env.fanvueClientId}:${env.fanvueClientSecret}`).toString("base64")}`;
  const response = await fetch("https://auth.fanvue.com/oauth2/token", { method: "POST", headers, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: decryptToken(connection.encrypted_refresh_token) }) });
  if (!response.ok) throw new Error("Fanvue token refresh failed. Reconnect Fanvue.");
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!payload.access_token) throw new Error("Fanvue token refresh did not return an access token.");
  await supabase.from("fanvue_connections").update({
    encrypted_access_token: encryptToken(payload.access_token),
    encrypted_refresh_token: payload.refresh_token ? encryptToken(payload.refresh_token) : connection.encrypted_refresh_token,
    access_token_expires_at: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
    granted_scopes: payload.scope?.split(" ").filter(Boolean) ?? undefined,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  return payload.access_token;
}

export async function healthyFanvueConnection(supabase: SupabaseServerClient, organizationId: string, creatorProfileId?: string) {
  let query = supabase.from("fanvue_connections").select("id, creator_profile_id, external_user_uuid, encrypted_access_token, encrypted_refresh_token, access_token_expires_at").eq("organization_id", organizationId).eq("status", "healthy");
  if (creatorProfileId) query = query.eq("creator_profile_id", creatorProfileId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error("Fanvue connection could not be loaded.");
  return data as FanvueConnection | null;
}
