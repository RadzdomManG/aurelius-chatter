import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queueLatestAutomationJob } from "@/server/automation/fanvue-auto-reply";
import { wakeAutomationWorker } from "@/server/automation/wake";
import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueRequest, fanvueSenderType, type FanvueChat, type FanvueMessage, type FanvuePaged } from "@/server/fanvue/client";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";
export const maxDuration = 60;

// Production logs showed the sequential Fanvue reconciliation exceeding Vercel's
// 60 second function limit at 12 chats. Keep each bounded pass below that limit;
// webhooks remain the live-message path and subsequent syncs reconcile more chats.
const SYNC_CHAT_LIMIT = 5;
const SYNC_MESSAGES_PER_CHAT = 8;

async function workspace() {
  return workspaceSession();
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, organizationId } = await workspace();
    if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

    const connection = await healthyFanvueConnection(supabase, organizationId);
    if (!connection) return Response.json({ error: "Connect Fanvue before syncing." }, { status: 404 });

    const accessToken = await accessTokenForFanvue(supabase, connection);
    const admin = createSupabaseAdminClient();
    const chats = await fanvueRequest<FanvuePaged<FanvueChat>>(`/v1/chats?page=1&size=${SYNC_CHAT_LIMIT}`, accessToken);
    const { data: existingConversationRows } = await supabase
      .from("conversations")
      .select("id, last_message_at, fans(external_uuid)")
      .eq("organization_id", organizationId)
      .eq("creator_profile_id", connection.creator_profile_id);
    const existingConversationByFan = new Map((existingConversationRows ?? []).flatMap((row) => {
      const existingFan = Array.isArray(row.fans) ? row.fans[0] : row.fans;
      return existingFan?.external_uuid ? [[existingFan.external_uuid, row] as const] : [];
    }));
    let conversationsImported = 0;
    let messagesImported = 0;
    let automationQueued = 0;

    for (const chat of chats.data ?? []) {
      const fanUuid = chat.user?.uuid;
      if (!fanUuid) continue;
      if (fanUuid === connection.external_user_uuid) continue;
      console.log("FAN_ID_RESOLVED", { source: "sync", fanUuid, creatorProfileId: connection.creator_profile_id, organizationId });
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
      console.log("CONVERSATION_RESOLVED", { source: "sync", conversationId: conversation.id, fanUuid, creatorProfileId: connection.creator_profile_id });
      conversationsImported += 1;

      const existingConversation = existingConversationByFan.get(fanUuid);
      const existingConversationHasHistory = Boolean(existingConversation?.last_message_at);
      const remoteLastMessageAt = chat.lastMessage?.createdAt;
      if (existingConversationHasHistory && existingConversation?.last_message_at && remoteLastMessageAt && new Date(remoteLastMessageAt).getTime() <= new Date(existingConversation.last_message_at).getTime()) continue;

      const messages = await fanvueRequest<FanvuePaged<FanvueMessage>>(`/v1/chats/${fanUuid}/messages?size=${SYNC_MESSAGES_PER_CHAT}&markAsRead=false`, accessToken).catch(() => null);
      if (!messages) continue;
      let latestFanMessage: { uuid: string; body: string; createdAt: string } | null = null;
      let latestNewFanMessage: { uuid: string; createdAt: string } | null = null;
      for (const fanvueMessage of messages.data ?? []) {
        if (!fanvueMessage.uuid) continue;
        const body = fanvueMessageBody(fanvueMessage);
        if (!body) continue;
        const createdAt = fanvueMessageCreatedAt(fanvueMessage);
        const senderType = fanvueSenderType(fanvueMessage, connection.external_user_uuid);
        console.log("MESSAGE_DIRECTION_RESOLVED", { source: "sync", externalMessageUuid: fanvueMessage.uuid, senderType, conversationId: conversation.id });
        const { data: insertedMessages, error: messageError } = await supabase.from("messages").upsert({
          organization_id: organizationId,
          creator_profile_id: connection.creator_profile_id,
          conversation_id: conversation.id,
          external_uuid: fanvueMessage.uuid,
          sender_type: senderType,
          body,
          created_at: createdAt,
        }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true }).select("id");
        const wasInserted = !messageError && (insertedMessages?.length ?? 0) > 0;
        if (wasInserted) {
          messagesImported += 1;
          console.log("MESSAGE_INSERTED", { source: "sync", externalMessageUuid: fanvueMessage.uuid, senderType, conversationId: conversation.id });
        }
        if (senderType === "fan" && (!latestFanMessage || new Date(createdAt).getTime() > new Date(latestFanMessage.createdAt).getTime())) {
          latestFanMessage = { uuid: fanvueMessage.uuid, body, createdAt };
        }
        if (wasInserted && senderType === "fan" && (!latestNewFanMessage || new Date(createdAt).getTime() > new Date(latestNewFanMessage.createdAt).getTime())) {
          latestNewFanMessage = { uuid: fanvueMessage.uuid, createdAt };
        }
      }

      if (latestFanMessage) {
        await supabase.from("conversations").update({ last_message_at: latestFanMessage.createdAt, updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("organization_id", organizationId);
      }
      if (existingConversationHasHistory && latestNewFanMessage) {
        await queueLatestAutomationJob(admin, {
          organizationId,
          creatorProfileId: connection.creator_profile_id,
          conversationId: conversation.id,
          triggerMessageUuid: latestNewFanMessage.uuid,
          debounceSeconds: 0,
        });
        automationQueued += 1;
      }
    }

    if (automationQueued > 0) after(() => wakeAutomationWorker(request.url, Math.min(automationQueued, 5)).catch((error) => {
      console.error("SYNC_AUTOMATION_WORKER_WAKE_FAILED", error);
    }));

    return Response.json({ synced: true, conversationsImported, messagesImported, automationQueued });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fanvue sync failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
