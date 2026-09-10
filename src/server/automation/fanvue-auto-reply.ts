import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMemoryContext, estimateContextCharacters } from "@/domain/memory/context";
import { serverEnv, xaiEnv } from "@/lib/env";
import { generateReplyDecision } from "@/server/ai/xai";
import { fanvueRequest } from "@/server/fanvue/client";
import { decryptToken, encryptToken } from "@/server/fanvue/encryption";
import { recordBotActionSafely } from "@/server/operator/logging";

type AutoReplySupabase = SupabaseClient;

type AutoReplyInput = {
  organizationId: string;
  creatorProfileId: string;
  conversationId: string;
  fanId: string;
  fanUuid: string;
  triggerMessageUuid: string;
  latestFanMessage: string;
};

export type AutoReplyResult =
  | { status: "completed"; externalUuid?: string | null }
  | { status: "queued"; reason: string }
  | { status: "cancelled"; reason: string };

const CREATOR_PROMO_PATTERNS = [
  /\bcollab(?:orate|oration)?\b/i,
  /\bsfs\b/i,
  /\bcreator\b/i,
  /\bsubscribe\s+to\s+me\b/i,
  /https?:\/\/\S+/i,
  /\b(?:fanvue|onlyfans|fansly|freevues)\.com\b/i,
];

export function creatorPromoSkipReason(message: string, identityText = ""): string | null {
  const text = `${message} ${identityText}`.trim();
  if (!text) return "Empty message.";
  return CREATOR_PROMO_PATTERNS.some((pattern) => pattern.test(text))
    ? "Skipped creator/collab/SFS/self-promo message."
    : null;
}

export async function accessTokenForAutomation(supabase: AutoReplySupabase, connection: {
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

export async function queueLatestAutomationJob(supabase: AutoReplySupabase, input: {
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

export async function markAutomationJobFromResult(supabase: AutoReplySupabase, jobId: string | undefined, result: AutoReplyResult) {
  if (!jobId) return;
  if (result.status === "completed") {
    await supabase.from("automation_jobs").update({ status: "completed", last_error: null, updated_at: new Date().toISOString() }).eq("id", jobId);
    return;
  }
  if (result.status === "cancelled") {
    await supabase.from("automation_jobs").update({ status: "cancelled", last_error: result.reason, updated_at: new Date().toISOString() }).eq("id", jobId);
  }
}

export async function processClaimedAutomationJob(supabase: AutoReplySupabase, job: {
  id: string;
  organization_id: string;
  creator_profile_id: string;
  conversation_id: string;
  trigger_message_uuid: string;
  attempts: number;
}): Promise<AutoReplyResult> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, fan_id, status, fans(id, external_uuid, automation_paused)")
    .eq("id", job.conversation_id)
    .eq("organization_id", job.organization_id)
    .maybeSingle();
  const fan = Array.isArray(conversation?.fans) ? conversation?.fans[0] : conversation?.fans;
  if (!conversation || !fan?.id || !fan.external_uuid) return { status: "cancelled", reason: "Conversation or fan was not found." };

  const { data: message } = await supabase
    .from("messages")
    .select("external_uuid, body, sender_type, created_at")
    .eq("organization_id", job.organization_id)
    .eq("conversation_id", job.conversation_id)
    .eq("external_uuid", job.trigger_message_uuid)
    .maybeSingle();
  if (!message?.body || message.sender_type !== "fan") return { status: "cancelled", reason: "Trigger message is not a fan message." };

  const result = await processFanMessageAutoReply(supabase, {
    organizationId: job.organization_id,
    creatorProfileId: job.creator_profile_id,
    conversationId: job.conversation_id,
    fanId: fan.id,
    fanUuid: fan.external_uuid,
    triggerMessageUuid: message.external_uuid,
    latestFanMessage: message.body,
  });
  await markAutomationJobFromResult(supabase, job.id, result);
  return result;
}

export async function processFanMessageAutoReply(supabase: AutoReplySupabase, input: AutoReplyInput): Promise<AutoReplyResult> {
  const { data: fan } = await supabase.from("fans").select("automation_paused, display_name, handle").eq("id", input.fanId).eq("organization_id", input.organizationId).maybeSingle();
  const skipReason = creatorPromoSkipReason(input.latestFanMessage, `${fan?.display_name ?? ""} ${fan?.handle ?? ""}`);
  if (skipReason) return { status: "cancelled", reason: skipReason };
  if (fan?.automation_paused) return { status: "queued", reason: "AI stopped for this fan." };

  const { data: conversation } = await supabase.from("conversations").select("status").eq("id", input.conversationId).eq("organization_id", input.organizationId).maybeSingle();
  if (conversation?.status === "paused") return { status: "queued", reason: "AI stopped for this conversation." };

  const { data: settings } = await supabase.from("automation_settings").select("enabled, approval_required, quiet_hours_start, quiet_hours_end, max_replies_per_hour, min_confidence").eq("organization_id", input.organizationId).is("creator_profile_id", null).maybeSingle();
  const automation = settings ?? { enabled: true, approval_required: false, quiet_hours_start: null, quiet_hours_end: null, max_replies_per_hour: 20, min_confidence: 0 };
  if (!automation.enabled) return { status: "queued", reason: "Bot is stopped for all fans." };
  if (automation.approval_required) return { status: "queued", reason: "Manual approval is enabled." };

  const { data: latestMessage } = await supabase.from("messages").select("external_uuid, sender_type, created_at").eq("conversation_id", input.conversationId).eq("organization_id", input.organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latestMessage?.external_uuid !== input.triggerMessageUuid || latestMessage.sender_type !== "fan") return { status: "queued", reason: "A newer local message exists." };
  if (new Date(latestMessage.created_at).getTime() < Date.now() - 300_000) return { status: "queued", reason: "Fan message is no longer fresh." };

  const parseTime = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const quietStart = parseTime(automation.quiet_hours_start);
  const quietEnd = parseTime(automation.quiet_hours_end);
  const inQuietHours = quietStart !== null && quietEnd !== null && (quietStart <= quietEnd ? currentMinutes >= quietStart && currentMinutes < quietEnd : currentMinutes >= quietStart || currentMinutes < quietEnd);
  if (inQuietHours) return { status: "queued", reason: "Quiet hours are active." };

  const since = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase.from("bot_action_logs").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).in("action_type", ["message_send", "ppv_message_send"]).gte("created_at", since);
  if ((count ?? 0) >= Number(automation.max_replies_per_hour ?? 20)) return { status: "queued", reason: "Hourly auto-reply limit reached." };
  const { count: recentConversationReplies } = await supabase.from("bot_action_logs").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).eq("conversation_id", input.conversationId).eq("action_type", "message_send").gte("created_at", new Date(Date.now() - 90_000).toISOString());
  if ((recentConversationReplies ?? 0) > 0) return { status: "queued", reason: "Recent reply already sent to this fan." };

  const { data: persona } = await supabase.from("persona_profiles").select("display_name, instructions").eq("organization_id", input.organizationId).eq("creator_profile_id", input.creatorProfileId).eq("active", true).maybeSingle();
  const instructions = typeof persona?.instructions === "string" ? persona.instructions.trim() : "";
  if (!instructions) return { status: "queued", reason: "No active persona is configured." };

  const { data: messages } = await supabase.from("messages").select("body, sender_type, created_at").eq("conversation_id", input.conversationId).eq("organization_id", input.organizationId).order("created_at", { ascending: true }).limit(12);
  const env = xaiEnv();
  const contextValue = buildMemoryContext({
    persona: instructions,
    latestFanMessage: input.latestFanMessage,
    recentMessages: (messages ?? []).filter((message) => message.body?.trim()).map((message) => `${message.sender_type === "fan" ? "fan" : "owner"}: ${message.body}`),
    relevantMemories: [],
    rollingSummary: "",
    unresolvedItems: [],
    approvedKnowledge: "You are writing as the Fanvue owner/model to a real fan. Do not engage creator, collab, SFS, subscribe-to-me, or promotional-link accounts. Optimize for warm fan retention and ethical revenue. Keep replies concise and persona-faithful.",
  }, {
    maxRecentMessages: env.maxRecentMessages,
    maxMemories: env.maxMemories,
    maxSummaryCharacters: env.maxSummaryCharacters,
    maxPromptCharacters: env.maxPromptCharacters,
  });
  const decision = await generateReplyDecision(contextValue);
  if (decision.action !== "reply" || !decision.replyText?.trim() || decision.confidence < Number(automation.min_confidence ?? 0)) return { status: "queued", reason: "AI did not produce a sendable reply." };

  const { data: connection } = await supabase.from("fanvue_connections").select("id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, external_user_uuid").eq("organization_id", input.organizationId).eq("creator_profile_id", input.creatorProfileId).eq("status", "healthy").maybeSingle();
  if (!connection || input.fanUuid === connection.external_user_uuid) return { status: "queued", reason: "Fanvue connection is unavailable or points to the owner account." };
  const accessToken = await accessTokenForAutomation(supabase, connection);
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
    metadata: { source: "fanvue_auto_reply", triggerMessageUuid: input.triggerMessageUuid, personaName: persona?.display_name ?? null, confidence: decision.confidence },
  });
  return { status: "completed", externalUuid: payload.messageUuid };
}
