import { workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function GET(request: Request) {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

  const url = new URL(request.url);
  const sinceConversation = validDate(url.searchParams.get("sinceConversation"));
  const sinceMessage = validDate(url.searchParams.get("sinceMessage"));
  const selectedConversationId = url.searchParams.get("conversationId");

  const { data: creatorConnections } = await supabase
    .from("fanvue_connections")
    .select("external_user_uuid")
    .eq("organization_id", organizationId)
    .eq("status", "healthy");
  const creatorUuids = new Set((creatorConnections ?? []).map((connection) => connection.external_user_uuid).filter(Boolean));

  let conversationsQuery = supabase
    .from("conversations")
    .select("id, status, unread_count, last_message_at, updated_at, fans(display_name, handle, automation_paused, external_uuid)")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false })
    .limit(20);
  if (sinceConversation) conversationsQuery = conversationsQuery.gt("updated_at", sinceConversation);
  const { data: conversationRows, error: conversationError } = await conversationsQuery;
  if (conversationError) return Response.json({ error: "Inbox conversations could not be loaded." }, { status: 502 });

  const conversationIds = new Set<string>();
  const conversations = (conversationRows ?? []).flatMap((conversation) => {
    const fan = Array.isArray(conversation.fans) ? conversation.fans[0] : conversation.fans;
    if (fan?.external_uuid && creatorUuids.has(fan.external_uuid)) return [];
    conversationIds.add(conversation.id);
    return [{
      id: conversation.id,
      status: conversation.status,
      unreadCount: conversation.unread_count ?? 0,
      fanName: fan?.display_name ?? fan?.handle ?? "Fan",
      fanHandle: fan?.handle ?? null,
      automationPaused: Boolean(fan?.automation_paused) || conversation.status !== "ai_active",
      lastMessageAt: conversation.last_message_at,
      updatedAt: conversation.updated_at,
    }];
  });

  if (selectedConversationId) conversationIds.add(selectedConversationId);

  let messagesQuery = supabase
    .from("messages")
    .select("id, conversation_id, body, created_at, external_uuid, sender_type")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (conversationIds.size > 0) messagesQuery = messagesQuery.in("conversation_id", [...conversationIds]);
  if (sinceMessage) messagesQuery = messagesQuery.gt("created_at", sinceMessage);
  const { data: messageRows, error: messageError } = await messagesQuery;
  if (messageError) return Response.json({ error: "Inbox messages could not be loaded." }, { status: 502 });

  return Response.json({
    conversations,
    messages: (messageRows ?? []).map((message) => ({
      id: message.id,
      conversationId: message.conversation_id,
      body: message.body,
      createdAt: message.created_at,
      externalUuid: message.external_uuid,
      senderType: message.sender_type,
    })),
    syncedAt: new Date().toISOString(),
  });
}
