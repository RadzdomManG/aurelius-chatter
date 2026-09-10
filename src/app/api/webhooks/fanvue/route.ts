import { verifyFanvueSignature } from "@/server/fanvue/signatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueRequest, fanvueSenderType, type FanvueMessage, type FanvuePaged } from "@/server/fanvue/client";
import { accessTokenForAutomation, queueLatestAutomationJob } from "@/server/automation/fanvue-auto-reply";
import { processAutomationQueue } from "@/server/automation/worker";
import { after } from "next/server";

export const runtime = "nodejs";

type FanvueWebhookData = Record<string, unknown>;
type FanvueIdentity = { uuid?: string; handle?: string | null; display_name?: string | null; displayName?: string | null };
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type WebhookConnection = {
  id: string;
  organization_id: string;
  creator_profile_id: string;
  external_user_uuid: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
};

function objectValue(value: unknown): FanvueWebhookData {
  return value && typeof value === "object" ? value as FanvueWebhookData : {};
}

function identityValue(value: unknown): FanvueIdentity {
  return value && typeof value === "object" ? value as FanvueIdentity : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizedEvent(raw: unknown): { id: string | null; type: string | null; creatorUuid: string | null; safePayload: Record<string, unknown>; data: FanvueWebhookData } {
  if (!raw || typeof raw !== "object") return { id: null, type: null, creatorUuid: null, safePayload: {}, data: {} };
  const event = raw as Record<string, unknown>;
  const data = objectValue(event.data);
  const creator = identityValue(data.creator);
  const fan = identityValue(data.fan);
  const follower = identityValue(data.follower);
  return {
    id: typeof event.id === "string" ? event.id : null,
    type: typeof event.type === "string" ? event.type : null,
    creatorUuid: typeof creator.uuid === "string" ? creator.uuid : null,
    data,
    safePayload: {
      object: typeof data.object === "string" ? data.object : null,
      creatorUuid: stringValue(creator.uuid),
      fanUuid: stringValue(fan.uuid),
      followerUuid: stringValue(follower.uuid),
      messageUuid: stringValue(data.uuid),
      sender: stringValue(data.sender),
      unreadMessagesCount: numberValue(data.unread_messages_count),
    },
  };
}

async function ensureFanConversation(supabase: AdminClient, input: {
  organizationId: string;
  creatorProfileId: string;
  fan: FanvueIdentity;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  status?: "ai_active" | "paused";
}) {
  const fanUuid = stringValue(input.fan.uuid);
  if (!fanUuid) return null;
  const { data: existingFan } = await supabase.from("fans").select("id, automation_paused").eq("creator_profile_id", input.creatorProfileId).eq("external_uuid", fanUuid).maybeSingle();
  const { data: fan } = await supabase.from("fans").upsert({
    organization_id: input.organizationId,
    creator_profile_id: input.creatorProfileId,
    external_uuid: fanUuid,
    display_name: stringValue(input.fan.display_name) ?? stringValue(input.fan.displayName),
    handle: stringValue(input.fan.handle),
  }, { onConflict: "creator_profile_id,external_uuid" }).select("id, automation_paused").single();
  if (!fan) return null;
  const paused = Boolean(fan.automation_paused ?? existingFan?.automation_paused);
  const { data: conversation } = await supabase.from("conversations").upsert({
    organization_id: input.organizationId,
    creator_profile_id: input.creatorProfileId,
    fan_id: fan.id,
    status: paused ? "paused" : input.status ?? "ai_active",
    unread_count: input.unreadCount ?? 0,
    last_message_at: input.lastMessageAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "creator_profile_id,fan_id" }).select("id, status").single();
  return conversation ? { fanId: fan.id as string, fanUuid, conversationId: conversation.id as string, status: conversation.status as string } : null;
}

async function syncRecentFanvueMessages(supabase: AdminClient, connection: WebhookConnection, conversation: { conversationId: string }, fanUuid: string) {
  const accessToken = await accessTokenForAutomation(supabase, connection);
  const messages = await fanvueRequest<FanvuePaged<FanvueMessage>>(`/v1/chats/${fanUuid}/messages?size=10&markAsRead=false`, accessToken);
  let latestFanMessage: { uuid: string; body: string; createdAt: string } | null = null;
  for (const fanvueMessage of messages.data ?? []) {
    if (!fanvueMessage.uuid) continue;
    const body = fanvueMessageBody(fanvueMessage);
    if (!body) continue;
    const createdAt = fanvueMessageCreatedAt(fanvueMessage);
    const senderType = fanvueSenderType(fanvueMessage, connection.external_user_uuid);
    await supabase.from("messages").upsert({
      organization_id: connection.organization_id,
      creator_profile_id: connection.creator_profile_id,
      conversation_id: conversation.conversationId,
      external_uuid: fanvueMessage.uuid,
      sender_type: senderType,
      body,
      created_at: createdAt,
    }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });
    if (senderType === "fan" && (!latestFanMessage || new Date(createdAt).getTime() > new Date(latestFanMessage.createdAt).getTime())) {
      latestFanMessage = { uuid: fanvueMessage.uuid, body, createdAt };
    }
  }
  if (latestFanMessage) {
    await supabase.from("conversations").update({ last_message_at: latestFanMessage.createdAt, updated_at: new Date().toISOString() }).eq("id", conversation.conversationId);
  }
  return latestFanMessage;
}

async function processWebhookEvent(supabase: AdminClient, safe: ReturnType<typeof sanitizedEvent>, connection: WebhookConnection) {
  const organizationId = connection.organization_id;
  const creatorProfileId = connection.creator_profile_id;
  const data = safe.data;
  if (safe.type === "creator.follow.created") {
    await ensureFanConversation(supabase, {
      organizationId,
      creatorProfileId,
      fan: identityValue(data.follower),
      unreadCount: 0,
      lastMessageAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
    });
    return;
  }

  if (safe.type === "creator.message.deleted") {
    const messageUuid = stringValue(data.uuid);
    if (messageUuid) await supabase.from("messages").delete().eq("organization_id", organizationId).eq("creator_profile_id", creatorProfileId).eq("external_uuid", messageUuid);
    return;
  }

  if (safe.type !== "creator.message.received" && safe.type !== "creator.message.sent") return;
  const fan = identityValue(data.fan);
  const conversation = await ensureFanConversation(supabase, {
    organizationId,
    creatorProfileId,
    fan,
    unreadCount: numberValue(data.unread_messages_count),
    lastMessageAt: stringValue(data.created_at) ?? new Date().toISOString(),
  });
  const messageUuid = stringValue(data.uuid);
  const text = stringValue(data.text);
  if (!conversation) return;
  const senderType = safe.type === "creator.message.received" ? "fan" : "creator";
  let messageError = null;
  if (messageUuid && text) {
    const result = await supabase.from("messages").upsert({
      organization_id: organizationId,
      creator_profile_id: creatorProfileId,
      conversation_id: conversation.conversationId,
      external_uuid: messageUuid,
      sender_type: senderType,
      body: text,
      created_at: stringValue(data.created_at) ?? new Date().toISOString(),
    }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });
    messageError = result.error;
  }
  const syncedLatest = senderType === "fan" ? await syncRecentFanvueMessages(supabase, connection, conversation, conversation.fanUuid).catch(() => null) : null;
  const trigger = syncedLatest ?? (messageUuid && text ? { uuid: messageUuid, body: text, createdAt: stringValue(data.created_at) ?? new Date().toISOString() } : null);
  if (!trigger) return;
  if (!messageError && senderType === "fan" && conversation.status === "ai_active") {
    await queueLatestAutomationJob(supabase, { organizationId, creatorProfileId, conversationId: conversation.conversationId, triggerMessageUuid: trigger.uuid });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.FANVUE_WEBHOOK_SECRET;
  if (!secret || !verifyFanvueSignature(rawBody, request.headers.get("x-fanvue-signature"), secret)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const safe = sanitizedEvent(event);
  if (!safe.id || !safe.type) return Response.json({ error: "Missing event identity" }, { status: 400 });
  try {
    const supabase = createSupabaseAdminClient();
    let organizationId: string | null = null;
    let creatorProfileId: string | null = null;
    let connection: WebhookConnection | null = null;
    if (safe.creatorUuid) {
      const { data } = await supabase.from("fanvue_connections").select("id, organization_id, creator_profile_id, external_user_uuid, encrypted_access_token, encrypted_refresh_token, access_token_expires_at").eq("external_user_uuid", safe.creatorUuid).eq("status", "healthy").maybeSingle();
      connection = data as WebhookConnection | null;
      organizationId = connection?.organization_id ?? null;
      creatorProfileId = connection?.creator_profile_id ?? null;
    }
    const { data: existingEvent } = await supabase.from("webhook_events").select("status").eq("external_event_id", safe.id).eq("event_type", safe.type).maybeSingle();
    if (existingEvent?.status === "processed") return Response.json({ accepted: true, duplicate: true, processed: true, eventId: safe.id, eventType: safe.type }, { status: 202 });
    const { error: insertError } = await supabase.from("webhook_events").upsert({ organization_id: organizationId, creator_profile_id: creatorProfileId, external_event_id: safe.id, event_type: safe.type, sanitized_payload: safe.safePayload }, { onConflict: "external_event_id,event_type", ignoreDuplicates: true });
    if (insertError) return Response.json({ error: "Webhook event could not be persisted." }, { status: 503 });
    if (organizationId && creatorProfileId) {
      try {
        if (connection) await processWebhookEvent(supabase, safe, connection);
        after(() => processAutomationQueue(3).catch(() => undefined));
        await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), last_error: null }).eq("external_event_id", safe.id).eq("event_type", safe.type);
      } catch (error) {
        await supabase.from("webhook_events").update({ status: "failed", last_error: error instanceof Error ? error.message : "Webhook processor failed." }).eq("external_event_id", safe.id).eq("event_type", safe.type);
        return Response.json({ error: "Webhook event was saved but could not be processed." }, { status: 503 });
      }
    }
    return Response.json({ accepted: true, processed: Boolean(organizationId && creatorProfileId), eventId: safe.id, eventType: safe.type }, { status: 202 });
  } catch {
    return Response.json({ error: "Webhook processing is not configured." }, { status: 503 });
  }
}
