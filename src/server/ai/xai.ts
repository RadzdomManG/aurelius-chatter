import { xaiEnv } from "@/lib/env";
import { replyDecisionSchema, memoryExtractionSchema, type ReplyDecision, type MemoryExtraction } from "@/domain/ai/schemas";
import type { MemoryContext } from "@/domain/memory/types";

export class XaiProviderError extends Error {}

function promptFor(context: MemoryContext, task: "reply" | "memory"): string {
  return `${context.safetyRules}\n\nTask: ${task}\nPersona:\n${context.persona}\nLatest fan message:\n${context.latestFanMessage}\nRecent messages:\n${context.recentMessages.join("\n")}\nRelevant memories:\n${context.relevantMemories.map((memory) => `${memory.memoryKey}: ${memory.memoryValue}`).join("\n")}\nRolling summary:\n${context.rollingSummary}\nApproved knowledge:\n${context.approvedKnowledge}\nReturn only the requested JSON structure. Never invent facts, prices, content, links, purchases, personal history, or promises.`;
}

async function complete(context: MemoryContext, task: "reply" | "memory"): Promise<unknown> {
  const env = xaiEnv();
  if (!env.apiKey || !env.model) throw new XaiProviderError("XAI_API_KEY and XAI_MODEL are required to enable AI generation.");
  const response = await fetch(`${env.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.model, temperature: 0.4, messages: [{ role: "system", content: promptFor(context, task) }, { role: "user", content: context.latestFanMessage }] }) });
  if (!response.ok) throw new XaiProviderError(`xAI request failed with ${response.status}.`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new XaiProviderError("xAI returned no content.");
  try { return JSON.parse(content); } catch { throw new XaiProviderError("xAI returned invalid JSON."); }
}

export async function generateReplyDecision(context: MemoryContext): Promise<ReplyDecision> { return replyDecisionSchema.parse(await complete(context, "reply")); }
export async function extractMemoryOperations(context: MemoryContext): Promise<MemoryExtraction> { return memoryExtractionSchema.parse(await complete(context, "memory")); }