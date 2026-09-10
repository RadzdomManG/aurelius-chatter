import { z } from "zod";

const optionalString = z.string().nullable().optional();
const optionalArray = z.array(z.string()).max(20).default([]);

export const replyDecisionSchema = z.object({
  action: z.enum(["reply", "wait", "handoff", "ignore"]),
  replyText: z.string().max(5000).nullable(),
  conversationStage: z.enum(["new", "rapport", "engaged", "sales_ready", "after_sale", "support"]),
  intent: z.enum(["greeting", "question", "flirting", "support", "purchase_interest", "complaint", "other"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.coerce.number().min(0).max(1),
  suggestedOfferId: optionalString,
  handoffReason: optionalString,
  riskFlags: optionalArray,
}).transform((value) => ({
  ...value,
  suggestedOfferId: value.suggestedOfferId ?? null,
  handoffReason: value.handoffReason ?? null,
  riskFlags: value.riskFlags ?? [],
}));

export const memoryExtractionSchema = z.object({
  memoryOperations: z.array(z.object({
    operation: z.enum(["create", "update", "confirm", "invalidate", "none"]),
    category: z.enum(["identity", "preference", "relationship", "interest", "boundary", "sales", "support", "conversation"]),
    key: z.string().min(1).max(120),
    value: z.string().min(1).max(1000),
    confidence: z.number().min(0).max(1),
    sourceMessageUuid: z.string().min(1),
    reason: z.string().max(240),
  })).max(12),
  unresolvedItems: z.array(z.object({ type: z.enum(["question", "promise", "follow_up"]), text: z.string().max(500), status: z.enum(["open", "completed", "cancelled"]) })).max(20),
  summaryUpdateRequired: z.boolean(),
});

export type ReplyDecision = z.infer<typeof replyDecisionSchema>;
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;