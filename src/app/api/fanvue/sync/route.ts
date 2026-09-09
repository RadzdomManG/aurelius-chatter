import { createSupabaseServerClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { decryptToken, encryptToken } from "@/server/fanvue/encryption";
import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueRequest, fanvueSenderType, type FanvueChat, type FanvueMessage, type FanvuePaged } from "@/server/fanvue/client";

export const runtime = "nodejs";

async function workspace() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, userId: null, organizationId: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
  return { supabase, userId: userData.user.id, organizationId: membership?.organization_id ?? null };
}

async function accessTokenForSync(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, connection: { id: string; encrypted_access_token: string; encrypted_refresh_token: string; access_token_expires_at: string }) {
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

export async function POST() {
  try {
    const { supabase, userId, organizationId } = await workspace();
    if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

    const { data: connection, error: connectionError } = await supabase.from("fanvue_connections").select("id, creator_profile_id, external_user_uuid, encrypted_access_token, encrypted_refresh_token, access_token_expires_at").eq("organization_id", organizationId).eq("status", "healthy").limit(1).maybeSingle();
    if (connectionError) return Response.json({ error: "Fanvue connection could not be loaded." }, { status: 503 });
    if (!connection) return Response.json({ error: "Connect Fanvue before syncing." }, { status: 404 });

    const accessToken = await accessTokenForSync(supabase, connection);
    const chats = await fanvueRequest<FanvuePaged<FanvueChat>>("/chats?filter=unread&page=1&size=50", accessToken);
    let conversationsImported = 0;
    let messagesImported = 0;

    for (const chat of chats.data ?? []) {
      const fanUuid = chat.user?.uuid;
      if (!fanUuid) continue;
      const { data: fan, error: fanError } = await supabase.from("fans").upsert({
        organization_id: organizationId,
        creator_profile_id: connection.creator_profile_id,
        external_uuid: fanUuid,
        display_name: chat.user?.displayName ?? null,
        handle: chat.user?.handle ?? null,
      }, { onConflict: "creator_profile_id,external_uuid" }).select("id, automation_paused").single();
      if (fanError || !fan) continue;

      const { data: conversation, error: conversationError } = await supabase.from("conversations").upsert({
        organization_id: organizationId,
        creator_profile_id: connection.creator_profile_id,
        fan_id: fan.id,
        status: fan.automation_paused ? "paused" : "ai_active",
        unread_count: chat.unreadMessagesCount ?? (chat.isRead === false ? 1 : 0),
        last_message_at: chat.lastMessage?.createdAt ?? new Date().toISOString(),
      }, { onConflict: "creator_profile_id,fan_id" }).select("id").single();
      if (conversationError || !conversation) continue;
      conversationsImported += 1;

      const messages = await fanvueRequest<FanvuePaged<FanvueMessage>>(`/chats/${fanUuid}/messages?size=25&markAsRead=false`, accessToken);
      for (const fanvueMessage of messages.data ?? []) {
        if (!fanvueMessage.uuid) continue;
        const body = fanvueMessageBody(fanvueMessage);
        if (!body) continue;
        const { error: messageError } = await supabase.from("messages").upsert({
          organization_id: organizationId,
          creator_profile_id: connection.creator_profile_id,
          conversation_id: conversation.id,
          external_uuid: fanvueMessage.uuid,
          sender_type: fanvueSenderType(fanvueMessage, connection.external_user_uuid),
          body,
          created_at: fanvueMessageCreatedAt(fanvueMessage),
        }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });
        if (!messageError) messagesImported += 1;
      }
    }

    return Response.json({ synced: true, conversationsImported, messagesImported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fanvue sync failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
