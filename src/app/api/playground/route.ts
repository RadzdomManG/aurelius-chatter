import { buildMemoryContext, estimateContextCharacters, estimateSavedCharacters } from "@/domain/memory/context";
import { generateReplyDecision, XaiProviderError } from "@/server/ai/xai";
import { xaiEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PlaygroundPersona = { instructions: string; personaName: string };

async function workspace() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, userId: null, organizationId: null };
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
  return { supabase, userId: userData.user.id, organizationId: membership?.organization_id ?? null };
}

export async function loadPlaygroundPersona(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, organizationId: string, modelId: string): Promise<PlaygroundPersona | Response> {
  const { data: model, error: modelError } = await supabase.from("creator_profiles").select("id, persona_profiles(id, display_name, instructions, active)").eq("id", modelId).eq("organization_id", organizationId).maybeSingle();
  if (modelError) return Response.json({ error: "Model could not be loaded." }, { status: 503 });
  if (!model) return Response.json({ error: "Model not found." }, { status: 404 });
  const personaProfiles = Array.isArray(model.persona_profiles) ? model.persona_profiles : model.persona_profiles ? [model.persona_profiles] : [];
  const activePersona = personaProfiles.find((persona) => persona.active) ?? null;
  const instructions = activePersona?.instructions?.trim();
  if (!activePersona || !instructions) return Response.json({ error: "This model does not have an active persona yet.", setupHref: "/models" }, { status: 409 });
  return { instructions, personaName: activePersona.display_name };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { modelId?: string; message?: string; history?: string[] };
    const modelId = body.modelId?.trim();
    const message = body.message?.trim();
    const history = Array.isArray(body.history) ? body.history.filter((item): item is string => typeof item === "string").slice(-30) : [];
    if (!modelId) return Response.json({ error: "Choose a model to test." }, { status: 400 });
    if (!message || message.length > 5000) return Response.json({ error: "Enter a message between 1 and 5,000 characters." }, { status: 400 });
    const { supabase, userId, organizationId } = await workspace();
    if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
    const persona = await loadPlaygroundPersona(supabase, organizationId, modelId);
    if (persona instanceof Response) return persona;

    const env = xaiEnv();
    const context = buildMemoryContext({
      persona: persona.instructions,
      latestFanMessage: message,
      recentMessages: history,
      relevantMemories: [],
      rollingSummary: "",
      unresolvedItems: [],
      approvedKnowledge: "No approved knowledge configured in this simulation.",
    }, {
      maxRecentMessages: env.maxRecentMessages,
      maxMemories: env.maxMemories,
      maxSummaryCharacters: env.maxSummaryCharacters,
      maxPromptCharacters: env.maxPromptCharacters,
    });
    const decision = await generateReplyDecision(context);
    const fullHistory = [...history, message];
    return Response.json({
      decision,
      model: env.model ?? null,
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
