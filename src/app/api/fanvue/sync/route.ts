import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueRequest, fanvueSenderType, type FanvueChat, type FanvueMessage, type FanvuePaged } from "@/server/fanvue/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";
import { queueLatestAutomationJob } from "@/server/automation/fanvue-auto-reply";
import { processAutomationQueue } from "@/server/automation/worker";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYNC_CHAT_LIMIT = 12;
const SYNC_MESSAGES_PER_CHAT = 8;

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
    const admin = createSupabaseAdminClient();
    const chats = await fanvueRequest<FanvuePaged<FanvueChat>>(`/v1/chats?page=1&size=${SYNC_CHAT_LIMIT}`, accessToken);
    let conversationsImported = 0;
    let messagesImported = 0;

    for (const chat of chats.data ?? []) {
      const fanUuid = chat.user?.uuid;
      if (!fanUuid) continue;
      if (fanUuid === connection.external_user_uuid) continue;
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

      const messages = await fanvueRequest<FanvuePaged<FanvueMessage>>(`/v1/chats/${fanUuid}/messages?size=${SYNC_MESSAGES_PER_CHAT}&markAsRead=false`, accessToken).catch(() => null);
      if (!messages) continue;
      let latestFanMessage: { uuid: string; body: string; createdAt: string } | null = null;
      for (const fanvueMessage of messages.data ?? []) {
        if (!fanvueMessage.uuid) continue;
        const body = fanvueMessageBody(fanvueMessage);
        if (!body) continue;
        const createdAt = fanvueMessageCreatedAt(fanvueMessage);
        const senderType = fanvueSenderType(fanvueMessage, connection.external_user_uuid);
        const { error: messageError } = await supabase.from("messages").upsert({
          organization_id: organizationId,
          creator_profile_id: connection.creator_profile_id,
          conversation_id: conversation.id,
          external_uuid: fanvueMessage.uuid,
          sender_type: senderType,
          body,
          created_at: createdAt,
        }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });
        if (!messageError) messagesImported += 1;
        if (senderType === "fan" && (!latestFanMessage || new Date(createdAt).getTime() > new Date(latestFanMessage.createdAt).getTime())) {
          latestFanMessage = { uuid: fanvueMessage.uuid, body, createdAt };
        }
      }

      if (latestFanMessage && !fan.automation_paused) {
        await supabase.from("conversations").update({ last_message_at: latestFanMessage.createdAt, updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("organization_id", organizationId);
        await queueLatestAutomationJob(admin, {
          organizationId,
          creatorProfileId: connection.creator_profile_id,
          conversationId: conversation.id,
          triggerMessageUuid: latestFanMessage.uuid,
        });
      }
    }

    after(() => processAutomationQueue(10).catch(() => undefined));
    return Response.json({ synced: true, conversationsImported, messagesImported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fanvue sync failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
