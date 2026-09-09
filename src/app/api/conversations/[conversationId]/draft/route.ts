import { buildMemoryContext, estimateContextCharacters } from "@/domain/memory/context";
import { xaiEnv } from "@/lib/env";
import { generateReplyDecision, XaiProviderError } from "@/server/ai/xai";
import { healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

type ConversationForDraft = {
  id: string;
  status: string;
  creator_profile_id: string;
  fans: { external_uuid?: string | null; automation_paused?: boolean | null } | { external_uuid?: string | null; automation_paused?: boolean | null }[] | null;
  messages: Array<{ body: string | null; sender_type: "fan" | "creator" | "system"; created_at: string }> | null;
  creator_profiles: { persona_profiles?: Array<{ display_name: string; instructions: string; active: boolean }> | { display_name: string; instructions: string; active: boolean } | null } | null;
};

export async function POST(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await context.params;
    const { supabase, userId, organizationId } = await workspaceSession();
    if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, status, creator_profile_id, fans(external_uuid, automation_paused), messages(body, sender_type, created_at), creator_profiles(persona_profiles(display_name, instructions, active))")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle<ConversationForDraft>();
    const fan = Array.isArray(conversation?.fans) ? conversation?.fans[0] : conversation?.fans;
    if (!conversation || !fan?.external_uuid) return Response.json({ error: "Conversation not found." }, { status: 404 });

    const connection = await healthyFanvueConnection(supabase, organizationId, conversation.creator_profile_id);
    if (!connection) return Response.json({ error: "Connect Fanvue before generating drafts." }, { status: 404 });
    if (fan.external_uuid === connection.external_user_uuid) return Response.json({ error: "Creator accounts are excluded from AI drafts." }, { status: 404 });
    if (fan.automation_paused || conversation.status !== "ai_active") return Response.json({ error: "AI is stopped for this fan." }, { status: 409 });

    const personaProfiles = conversation.creator_profiles?.persona_profiles;
    const personas = Array.isArray(personaProfiles) ? personaProfiles : personaProfiles ? [personaProfiles] : [];
    const persona = personas.find((item) => item.active);
    const instructions = persona?.instructions?.trim();
    if (!instructions) return Response.json({ error: "This model does not have an active persona yet.", setupHref: "/models" }, { status: 409 });

    const env = xaiEnv();
    const fanMessages = (conversation.messages ?? [])
      .filter((message) => message.sender_type === "fan" && message.body?.trim())
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((message) => `fan: ${message.body}`);
    const latestFanMessage = fanMessages.at(-1)?.replace(/^fan: /, "").trim();
    if (!latestFanMessage) return Response.json({ error: "No fan message available for AI drafting." }, { status: 400 });

    const contextValue = buildMemoryContext({
      persona: instructions,
      latestFanMessage,
      recentMessages: fanMessages,
      relevantMemories: [],
      rollingSummary: "",
      unresolvedItems: [],
      approvedKnowledge: "Use only confirmed fan conversation context. Creator/self accounts and creator-authored messages are excluded.",
    }, {
      maxRecentMessages: env.maxRecentMessages,
      maxMemories: env.maxMemories,
      maxSummaryCharacters: env.maxSummaryCharacters,
      maxPromptCharacters: env.maxPromptCharacters,
    });
    const decision = await generateReplyDecision(contextValue);
    const promptCharacters = estimateContextCharacters(contextValue);
    return Response.json({
      decision,
      personaName: persona?.display_name ?? null,
      model: env.model,
      diagnostics: {
        recentFanMessagesUsed: contextValue.recentMessages.length,
        creatorMessagesExcluded: true,
        promptCharacters,
        estimatedInputTokens: Math.ceil(promptCharacters / 4),
        maxOutputTokens: env.maxOutputTokens,
      },
    });
  } catch (error) {
    const message = error instanceof XaiProviderError ? error.message : "AI draft generation failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
