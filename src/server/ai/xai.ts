import { xaiEnv } from "@/lib/env";
import { replyDecisionSchema, memoryExtractionSchema, type ReplyDecision, type MemoryExtraction } from "@/domain/ai/schemas";
import type { MemoryContext } from "@/domain/memory/types";
import { ZodError } from "zod";

export class XaiProviderError extends Error {}

function promptFor(context: MemoryContext, task: "reply" | "memory"): string {
  const contract = task === "reply"
    ? `Return exactly one JSON object with these fields: action (reply, wait, handoff, or ignore), replyText (string or null), conversationStage (new, rapport, engaged, sales_ready, after_sale, or support), intent (greeting, question, flirting, support, purchase_interest, complaint, or other), sentiment (positive, neutral, or negative), confidence (number from 0 to 1), suggestedOfferId (string or null), handoffReason (string or null), and riskFlags (array of strings).`
    : `Return exactly one JSON object with memoryOperations (array), unresolvedItems (array), and summaryUpdateRequired (boolean).`;
  return `${context.safetyRules}\n\nTask: ${task}\nPersona:\n${context.persona}\nLatest fan message:\n${context.latestFanMessage}\nRecent messages:\n${context.recentMessages.join("\n")}\nRelevant memories:\n${context.relevantMemories.map((memory) => `${memory.memoryKey}: ${memory.memoryValue}`).join("\n")}\nRolling summary:\n${context.rollingSummary}\nApproved knowledge:\n${context.approvedKnowledge}\n${contract}\nNever invent facts, prices, content, links, purchases, personal history, or promises.`;
}

async function complete(context: MemoryContext, task: "reply" | "memory"): Promise<unknown> {
  const env = xaiEnv();
  if (!env.apiKey || !env.model) throw new XaiProviderError("XAI_API_KEY and XAI_MODEL are required to enable AI generation.");
  const response = await fetch(`${env.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.model, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: promptFor(context, task) }, { role: "user", content: context.latestFanMessage }] }) });
  if (!response.ok) {
    const errorBody = await response.text();
    let providerMessage = "";
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } | string };
      providerMessage = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? "";
    } catch {
      providerMessage = "";
    }
    throw new XaiProviderError(`xAI request failed with ${response.status}${providerMessage ? `: ${providerMessage}` : "."}`);
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