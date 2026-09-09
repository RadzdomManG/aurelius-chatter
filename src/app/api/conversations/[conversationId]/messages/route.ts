import { fanvueRequest } from "@/server/fanvue/client";
import { parseMediaUuids, parsePriceCents, validateMediaUuids, validatePricedMedia } from "@/server/fanvue/actions";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

type ConversationTarget = {
  id: string;
  creator_profile_id: string;
  fans: { external_uuid?: string | null } | { external_uuid?: string | null }[] | null;
};

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await context.params;
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

  const body = await request.json().catch(() => null) as { text?: unknown; mediaUuids?: unknown; price?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const mediaUuids = parseMediaUuids(body?.mediaUuids);
  const price = parsePriceCents(body?.price);
  const mediaError = validateMediaUuids(mediaUuids);
  const priceError = validatePricedMedia(price, mediaUuids, 300);
  if (!text && mediaUuids.length === 0) return Response.json({ error: "Message text or media is required." }, { status: 400 });
  if (text.length > 5000) return Response.json({ error: "Message text must be 5000 characters or less." }, { status: 400 });
  if (mediaError || priceError) return Response.json({ error: mediaError ?? priceError }, { status: 400 });

  const { data: conversation } = await supabase.from("conversations").select("id, creator_profile_id, fans(external_uuid)").eq("id", conversationId).eq("organization_id", organizationId).maybeSingle<ConversationTarget>();
  const fan = Array.isArray(conversation?.fans) ? conversation?.fans[0] : conversation?.fans;
  if (!conversation || !fan?.external_uuid) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const connection = await healthyFanvueConnection(supabase, organizationId, conversation.creator_profile_id);
  if (!connection) return Response.json({ error: "Connect Fanvue before sending." }, { status: 404 });

  const accessToken = await accessTokenForFanvue(supabase, connection);
  const payload = await fanvueRequest<{ messageUuid: string }>(`/v1/chats/${fan.external_uuid}/message`, accessToken, {
    method: "POST",
    body: JSON.stringify({ text: text || null, mediaUuids, price }),
  });

  await supabase.from("messages").upsert({
    organization_id: organizationId,
    creator_profile_id: conversation.creator_profile_id,
    conversation_id: conversation.id,
    external_uuid: payload.messageUuid,
    sender_type: "creator",
    body: text || (price ? "PPV media message" : "Media message"),
    created_at: new Date().toISOString(),
  }, { onConflict: "creator_profile_id,external_uuid", ignoreDuplicates: true });

  return Response.json({ sent: true, messageUuid: payload.messageUuid });
}
