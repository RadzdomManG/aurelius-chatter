import { xaiEnv } from "@/lib/env";
import { replyDecisionSchema, memoryExtractionSchema, type ReplyDecision, type MemoryExtraction } from "@/domain/ai/schemas";
import type { MemoryContext } from "@/domain/memory/types";
import { ZodError } from "zod";

export class XaiProviderError extends Error {
  constructor(message: string, public retryable = false, public status?: number) { super(message); }
}

const XAI_TIMEOUT_MS = 12_000;
const XAI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function promptFor(context: MemoryContext, task: "reply" | "memory"): string {
  const contract = task === "reply"
    ? `Return one JSON object: action, replyText, conversationStage, intent, sentiment, confidence, suggestedOfferId, handoffReason, riskFlags.`
    : `Return one JSON object: memoryOperations, unresolvedItems, summaryUpdateRequired.`;
  return `${context.safetyRules}\nTask: ${task}\nPersona:\n${context.persona}\nRecent:\n${context.recentMessages.join("\n")}\nMemories:\n${context.relevantMemories.map((memory) => `${memory.memoryKey}: ${memory.memoryValue}`).join("\n")}\nSummary:\n${context.rollingSummary}\nKnowledge:\n${context.approvedKnowledge}\n${contract}\nNever invent facts, prices, content, links, purchases, personal history, or promises.`;
}

async function complete(context: MemoryContext, task: "reply" | "memory"): Promise<unknown> {
  const env = xaiEnv();
  if (!env.apiKey) throw new XaiProviderError("XAI_API_KEY is required to enable AI generation.");
  let response: Response | null = null;
  let lastNetworkError = "unknown";
  const configuredBaseUrl = env.baseUrl.replace(/\/$/, "");
  const baseUrls = [...new Set([configuredBaseUrl, "https://api.x.ai/v1", "https://us-east-1.api.x.ai/v1"])];
  for (let attempt = 0; attempt < baseUrls.length; attempt += 1) {
    try {
      response = await fetch(`${baseUrls[attempt]}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(XAI_TIMEOUT_MS), headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.model, temperature: 0.35, max_tokens: env.maxOutputTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: promptFor(context, task) }, { role: "user", content: context.latestFanMessage }] }) });
      if (response.ok || !XAI_RETRYABLE_STATUSES.has(response.status) || attempt === baseUrls.length - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
      lastNetworkError = cause?.message ?? (error instanceof Error ? error.message : "unknown");
      if (attempt === baseUrls.length - 1) throw new XaiProviderError(error instanceof Error && error.name === "TimeoutError" ? "xAI request timed out." : `xAI network request failed: ${lastNetworkError}`, true);
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (!response) throw new XaiProviderError("xAI request failed before receiving a response.", true);
  if (!response.ok) {
    const errorBody = await response.text();
    let providerMessage = "";
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } | string };
      providerMessage = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? "";
    } catch {
      providerMessage = "";
    }
    throw new XaiProviderError(`xAI request failed with ${response.status}${providerMessage ? `: ${providerMessage}` : "."}`, XAI_RETRYABLE_STATUSES.has(response.status), response.status);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new XaiProviderError("xAI returned no content.");
  try { return JSON.parse(content); } catch { throw new XaiProviderError("xAI returned invalid JSON."); }
}

export async function generateReplyDecision(context: MemoryContext): Promise<ReplyDecision> {
  try { return replyDecisionSchema.parse(await complete(context, "reply")); }
  catch (error) { if (error instanceof ZodError) throw new XaiProviderError("xAI returned JSON that did not match the reply decision schema."); throw error; }
}
export async function extractMemoryOperations(context: MemoryContext): Promise<MemoryExtraction> {
  try { return memoryExtractionSchema.parse(await complete(context, "memory")); }
  catch (error) { if (error instanceof ZodError) throw new XaiProviderError("xAI returned JSON that did not match the memory schema."); throw error; }
}
