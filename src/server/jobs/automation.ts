import type { MemoryContext } from "@/domain/memory/types";
import { buildMemoryContext } from "@/domain/memory/context";

export type AutomationJob = { id: string; conversationId: string; creatorProfileId: string; fanId: string; triggerMessageUuid: string; attempts: number; availableAt: string; status: "pending" | "running" | "completed" | "failed" | "dead_letter" };
export type AutomationPolicy = { globalEnabled: boolean; creatorEnabled: boolean; conversationStatus: "ai_active" | "paused" | "human_controlled" | "blocked"; mode: "off" | "draft" | "auto_safe" | "full_auto"; latestSender: "fan" | "creator"; confidenceFloor: number };

export function canProcessJob(policy: AutomationPolicy, confidence?: number): { allowed: boolean; reason?: string } {
  if (!policy.globalEnabled) return { allowed: false, reason: "Global emergency stop is active." };
  if (!policy.creatorEnabled || policy.mode === "off") return { allowed: false, reason: "Creator automation is disabled." };
  if (policy.conversationStatus !== "ai_active") return { allowed: false, reason: "Conversation is under human control or paused." };
  if (policy.latestSender !== "fan") return { allowed: false, reason: "Latest relevant message is not from the fan." };
  if (confidence !== undefined && confidence < policy.confidenceFloor) return { allowed: false, reason: "AI confidence is below the configured floor." };
  return { allowed: true };
}

export function buildAutomationContext(input: Parameters<typeof buildMemoryContext>[0], limits?: Parameters<typeof buildMemoryContext>[1]): MemoryContext { return buildMemoryContext(input, limits); }