import { fanvueRequest } from "@/server/fanvue/client";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

type ConversationTarget = {
  id: string;
  creator_profile_id: string;
  fans: { external_uuid?: string | null } | { external_uuid?: string | null }[] | null;
};

export async function DELETE(_request: Request, context: { params: Promise<{ conversationId: string; messageUuid: string }> }) {
  const { conversationId, messageUuid } = await context.params;
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

  const { data: conversation } = await supabase.from("conversations").select("id, creator_profile_id, fans(external_uuid)").eq("id", conversationId).eq("organization_id", organizationId).maybeSingle<ConversationTarget>();
  const fan = Array.isArray(conversation?.fans) ? conversation?.fans[0] : conversation?.fans;
  if (!conversation || !fan?.external_uuid) return Response.json({ error: "Conversation not found." }, { status: 404 });

  const { data: localMessage } = await supabase.from("messages").select("id, sender_type").eq("conversation_id", conversation.id).eq("organization_id", organizationId).eq("external_uuid", messageUuid).maybeSingle();
  if (localMessage && localMessage.sender_type !== "creator") return Response.json({ error: "Only creator-sent messages can be unsent." }, { status: 400 });

  const connection = await healthyFanvueConnection(supabase, organizationId, conversation.creator_profile_id);
  if (!connection) return Response.json({ error: "Connect Fanvue before unsending." }, { status: 404 });
  const accessToken = await accessTokenForFanvue(supabase, connection);
  await fanvueRequest<void>(`/v1/chats/${fan.external_uuid}/messages/${messageUuid}`, accessToken, { method: "DELETE" });
  await supabase.from("messages").delete().eq("conversation_id", conversation.id).eq("organization_id", organizationId).eq("external_uuid", messageUuid);
  return new Response(null, { status: 204 });
}
