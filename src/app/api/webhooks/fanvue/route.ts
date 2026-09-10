import { verifyFanvueSignature } from "@/server/fanvue/signatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMemoryContext, estimateContextCharacters } from "@/domain/memory/context";
import { xaiEnv, serverEnv } from "@/lib/env";
import { generateReplyDecision } from "@/server/ai/xai";
import { fanvueRequest } from "@/server/fanvue/client";
import { decryptToken, encryptToken } from "@/server/fanvue/encryption";
import { recordBotActionSafely } from "@/server/operator/logging";

export const runtime = "nodejs";

type FanvueWebhookData = Record<string, unknown>;
type FanvueIdentity = { uuid?: string; handle?: string | null; display_name?: string | null; displayName?: string | null };
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

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

async function accessTokenForWebhook(supabase: AdminClient, connection: {
  id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
}) {
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

async function maybeAutoReply(supabase: AdminClient, input: {
  organizationId: string;
  creatorProfileId: string;
  conversationId: string;
  fanId: string;
  fanUuid: string;
  triggerMessageUuid: string;
  latestFanMessage: string;
}) {
  const { data: settings } = await supabase.from("automation_settings").select("enabled, approval_required, quiet_hours_start, quiet_hours_end, max_replies_per_hour, min_confidence").eq("organization_id", input.organizationId).is("creator_profile_id", null).maybeSingle();
  const automation = settings ?? { enabled: true, approval_required: false, quiet_hours_start: null, quiet_hours_end: null, max_replies_per_hour: 20, min_confidence: 0.7 };
  if (!automation.enabled || automation.approval_required) return "queued";

  const { data: latestMessage } = await supabase.from("messages").select("external_uuid, sender_type, created_at").eq("conversation_id", input.conversationId).eq("organization_id", input.organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latestMessage?.external_uuid !== input.triggerMessageUuid || latestMessage.sender_type !== "fan") return "queued";
  if (new Date(latestMessage.created_at).getTime() < Date.now() - 120_000) return "queued";

  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const parseTime = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const quietStart = parseTime(automation.quiet_hours_start);
  const quietEnd = parseTime(automation.quiet_hours_end);
  const inQuietHours = quietStart !== null && quietEnd !== null && (quietStart <= quietEnd ? currentMinutes >= quietStart && currentMinutes < quietEnd : currentMinutes >= quietStart || currentMinutes < quietEnd);
  if (inQuietHours) return "queued";

  const since = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase.from("bot_action_logs").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).in("action_type", ["message_send", "ppv_message_send"]).gte("created_at", since);
  if ((count ?? 0) >= Number(automation.max_replies_per_hour ?? 20)) return "queued";
  const { count: recentConversationReplies } = await supabase.from("bot_action_logs").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).eq("conversation_id", input.conversationId).eq("action_type", "message_send").gte("created_at", new Date(Date.now() - 90_000).toISOString());
  if ((recentConversationReplies ?? 0) > 0) return "queued";

  const { data: persona } = await supabase.from("persona_profiles").select("display_name, instructions").eq("organization_id", input.organizationId).eq("creator_profile_id", input.creatorProfileId).eq("active", true).maybeSingle();
  const instructions = typeof persona?.instructions === "string" ? persona.instructions.trim() : "";
  if (!instructions) return "queued";

  const { data: messages } = await supabase.from("messages").select("body, sender_type, created_at").eq("conversation_id", input.conversationId).eq("organization_id", input.organizationId).order("created_at", { ascending: true }).limit(12);
  const env = xaiEnv();
  const contextValue = buildMemoryContext({
    persona: instructions,
    latestFanMessage: input.latestFanMessage,
    recentMessages: (messages ?? []).filter((message) => message.body?.trim()).map((message) => `${message.sender_type === "fan" ? "fan" : "owner"}: ${message.body}`),
    relevantMemories: [],
    rollingSummary: "",
    unresolvedItems: [],
    approvedKnowledge: "You are writing as the Fanvue owner/model to a real fan. Do not engage creator accounts. Optimize for warm fan retention and ethical revenue. Keep replies concise and persona-faithful.",
  }, {
    maxRecentMessages: env.maxRecentMessages,
    maxMemories: env.maxMemories,
    maxSummaryCharacters: env.maxSummaryCharacters,
    maxPromptCharacters: env.maxPromptCharacters,
  });
  const decision = await generateReplyDecision(contextValue);
  if (decision.action !== "reply" || !decision.replyText?.trim() || decision.confidence < Number(automation.min_confidence ?? 0.7)) return "queued";

  const { data: connection } = await supabase.from("fanvue_connections").select("id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, external_user_uuid").eq("organization_id", input.organizationId).eq("creator_profile_id", input.creatorProfileId).eq("status", "healthy").maybeSingle();
  if (!connection || input.fanUuid === connection.external_user_uuid) return "queued";
  const accessToken = await accessTokenForWebhook(supabase, connection);
  const payload = await fanvueRequest<{ messageUuid: string }>(`/v1/chats/${input.fanUuid}/message`, accessToken, {
    method: "POST",
    body: JSON.stringify({ text: decision.replyText.trim(), mediaUuids: [], price: null }),
  });
  await supabase.from("messages").upsert({
    organization_id: input.organizationId,
    creator_profile_id: input.creatorProfileId,
    conversation_id: input.conversationId,
    external_uuid: payload.messageUuid,
    sender_type: "creator",
    body: decision.replyText.trim(),
    created_at: new Date().toISOString(),
  }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });
  await recordBotActionSafely(supabase, {
    organizationId: input.organizationId,
    creatorProfileId: input.creatorProfileId,
    conversationId: input.conversationId,
    fanId: input.fanId,
    actionType: "message_send",
    status: "completed",
    provider: "xai",
    model: env.model,
    inputTokens: Math.ceil(estimateContextCharacters(contextValue) / 4),
    outputTokens: env.maxOutputTokens,
    externalUuid: payload.messageUuid,
    metadata: { source: "webhook_auto_reply", triggerMessageUuid: input.triggerMessageUuid, personaName: persona?.display_name ?? null, confidence: decision.confidence },
  });
  return "completed";
}

async function queueLatestAutomationJob(supabase: AdminClient, input: {
  organizationId: string;
  creatorProfileId: string;
  conversationId: string;
  triggerMessageUuid: string;
}) {
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("automation_jobs").select("id").eq("organization_id", input.organizationId).eq("conversation_id", input.conversationId).in("status", ["pending", "running"]).limit(1).maybeSingle();
  if (existing?.id) {
    const { data } = await supabase.from("automation_jobs").update({
      status: "pending",
      trigger_message_uuid: input.triggerMessageUuid,
      available_at: now,
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: now,
    }).eq("id", existing.id).select("id").maybeSingle();
    return data;
  }
  const { data } = await supabase.from("automation_jobs").insert({
    organization_id: input.organizationId,
    creator_profile_id: input.creatorProfileId,
    conversation_id: input.conversationId,
    trigger_message_uuid: input.triggerMessageUuid,
  }).select("id").maybeSingle();
  return data;
}

async function processWebhookEvent(supabase: AdminClient, safe: ReturnType<typeof sanitizedEvent>, organizationId: string, creatorProfileId: string) {
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
  if (!conversation || !messageUuid || !text) return;
  const senderType = data.sender === "creator" || safe.type === "creator.message.sent" ? "creator" : "fan";
  const { error: messageError } = await supabase.from("messages").upsert({
    organization_id: organizationId,
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.conversationId,
    external_uuid: messageUuid,
    sender_type: senderType,
    body: text,
    created_at: stringValue(data.created_at) ?? new Date().toISOString(),
  }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });
  if (!messageError && senderType === "fan" && conversation.status === "ai_active") {
    const job = await queueLatestAutomationJob(supabase, { organizationId, creatorProfileId, conversationId: conversation.conversationId, triggerMessageUuid: messageUuid });
    try {
      const autoStatus = await maybeAutoReply(supabase, {
        organizationId,
        creatorProfileId,
        conversationId: conversation.conversationId,
        fanId: conversation.fanId,
        fanUuid: conversation.fanUuid,
        triggerMessageUuid: messageUuid,
        latestFanMessage: text,
      });
      if (job?.id && autoStatus === "completed") await supabase.from("automation_jobs").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.id);
    } catch (error) {
      if (job?.id) await supabase.from("automation_jobs").update({ status: "failed", last_error: error instanceof Error ? error.message : "Auto-reply failed.", updated_at: new Date().toISOString() }).eq("id", job.id);
    }
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
    if (safe.creatorUuid) {
      const { data: connection } = await supabase.from("fanvue_connections").select("organization_id, creator_profile_id").eq("external_user_uuid", safe.creatorUuid).eq("status", "healthy").maybeSingle();
      organizationId = connection?.organization_id ?? null;
      creatorProfileId = connection?.creator_profile_id ?? null;
    }
    const { data: existingEvent } = await supabase.from("webhook_events").select("status").eq("external_event_id", safe.id).eq("event_type", safe.type).maybeSingle();
    if (existingEvent?.status === "processed") return Response.json({ accepted: true, duplicate: true, processed: true, eventId: safe.id, eventType: safe.type }, { status: 202 });
    const { error: insertError } = await supabase.from("webhook_events").upsert({ organization_id: organizationId, creator_profile_id: creatorProfileId, external_event_id: safe.id, event_type: safe.type, sanitized_payload: safe.safePayload }, { onConflict: "external_event_id,event_type", ignoreDuplicates: true });
    if (insertError) return Response.json({ error: "Webhook event could not be persisted." }, { status: 503 });
    if (organizationId && creatorProfileId) {
      try {
        await processWebhookEvent(supabase, safe, organizationId, creatorProfileId);
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
