import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueRequest, fanvueSenderType, type FanvueChat, type FanvueMessage, type FanvuePaged } from "@/server/fanvue/client";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

async function workspace() {
  return workspaceSession();
}

export async function POST() {
  try {
    const { supabase, userId, organizationId } = await workspace();
    if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

    const connection = await healthyFanvueConnection(supabase, organizationId);
    if (!connection) return Response.json({ error: "Connect Fanvue before syncing." }, { status: 404 });

    const accessToken = await accessTokenForFanvue(supabase, connection);
    const chats = await fanvueRequest<FanvuePaged<FanvueChat>>("/v1/chats?page=1&size=50", accessToken);
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

      const messages = await fanvueRequest<FanvuePaged<FanvueMessage>>(`/v1/chats/${fanUuid}/messages?size=25&markAsRead=false`, accessToken);
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
