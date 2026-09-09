import { buildMemoryContext, estimateContextCharacters, estimateSavedCharacters } from "@/domain/memory/context";
import { generateReplyDecision, XaiProviderError } from "@/server/ai/xai";
import { xaiEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: string; history?: string[] };
    const message = body.message?.trim();
    const history = Array.isArray(body.history) ? body.history.filter((item): item is string => typeof item === "string").slice(-30) : [];
    if (!message || message.length > 5000) return Response.json({ error: "Enter a message between 1 and 5,000 characters." }, { status: 400 });

    const context = buildMemoryContext({
      persona: "This is a test persona. Be warm, honest, concise, and never invent unavailable facts, prices, purchases, or content.",
      latestFanMessage: message,
      recentMessages: history,
      relevantMemories: [],
      rollingSummary: "",
      unresolvedItems: [],
      approvedKnowledge: "No approved knowledge configured in this simulation.",
    });
    const decision = await generateReplyDecision(context);
    const fullHistory = [...history, message];
    return Response.json({
      decision,
      model: xaiEnv().model ?? null,
      diagnostics: {
        testData: true,
        recentMessagesUsed: context.recentMessages.length,
        memoryRecordsLoaded: context.relevantMemories.length,
        summaryUsed: Boolean(context.rollingSummary),
        contextCharacters: estimateContextCharacters(context),
        estimatedHistoricalCharactersAvoided: estimateSavedCharacters(fullHistory, context),
        validation: "passed",
      },
    });
  } catch (error) {
    const message = error instanceof XaiProviderError ? error.message : "Playground generation failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
