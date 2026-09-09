import type { SupabaseClient } from "@supabase/supabase-js";

const inputMicroCents = Number(process.env.XAI_INPUT_COST_MICROCENTS_PER_TOKEN ?? "20");
const outputMicroCents = Number(process.env.XAI_OUTPUT_COST_MICROCENTS_PER_TOKEN ?? "80");

export function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

export function estimateXaiCostCents(inputTokens: number, outputTokens: number): number {
  return Number((((inputTokens * inputMicroCents) + (outputTokens * outputMicroCents)) / 1_000_000).toFixed(4));
}

export async function recordBotAction(supabase: SupabaseClient, action: {
  organizationId: string;
  creatorProfileId?: string | null;
  conversationId?: string | null;
  fanId?: string | null;
  actionType: string;
  status: "queued" | "completed" | "failed";
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  revenueCents?: number;
  externalUuid?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("bot_action_logs").insert({
    organization_id: action.organizationId,
    creator_profile_id: action.creatorProfileId ?? null,
    conversation_id: action.conversationId ?? null,
    fan_id: action.fanId ?? null,
    action_type: action.actionType,
    status: action.status,
    provider: action.provider ?? "fanvue",
    model: action.model ?? null,
    input_tokens: action.inputTokens ?? 0,
    output_tokens: action.outputTokens ?? 0,
    estimated_cost_cents: estimateXaiCostCents(action.inputTokens ?? 0, action.outputTokens ?? 0),
    revenue_cents: action.revenueCents ?? 0,
    external_uuid: action.externalUuid ?? null,
    error: action.error ?? null,
    metadata: action.metadata ?? {},
  });
}

export async function recordBotActionSafely(supabase: SupabaseClient, action: Parameters<typeof recordBotAction>[1]) {
  try {
    await recordBotAction(supabase, action);
  } catch {
    // The app must continue working if the production migration has not been applied yet.
  }
}
