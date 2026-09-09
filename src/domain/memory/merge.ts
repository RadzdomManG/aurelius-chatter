import { isUnsafeMemoryValue, normalizeMemoryKey } from "./safety";
import type { MemoryOperation, MemoryRecord } from "./types";

type MergeInput = { operation: MemoryOperation; existing?: MemoryRecord; now?: string; adultStatusConfirmed: boolean };
type MergeResult = { action: "create" | "update" | "confirm" | "invalidate" | "none"; record?: MemoryRecord; reason?: string };

export function mergeMemory({ operation, existing, now = new Date().toISOString(), adultStatusConfirmed }: MergeInput): MergeResult {
  if (operation.operation === "none") return { action: "none", reason: "No useful fact was extracted." };
  if (!operation.key.trim() || !operation.value.trim()) return { action: "none", reason: "Memory key and value are required." };
  if (isUnsafeMemoryValue(operation.value, adultStatusConfirmed)) return { action: "none", reason: "Sensitive or unsafe information was rejected." };

  const base = { ...operation, confidence: Math.min(1, Math.max(0, operation.confidence)), memoryKey: operation.key.trim(), memoryValue: operation.value.trim() };
  if (!existing && (operation.operation === "create" || operation.operation === "update" || operation.operation === "confirm")) {
    return { action: "create", record: { id: crypto.randomUUID(), organizationId: "", creatorProfileId: "", fanId: "", category: base.category, memoryKey: base.memoryKey, memoryValue: base.memoryValue, confidence: base.confidence, status: base.confidence >= 0.8 ? "confirmed" : "inferred", sensitivity: "normal", sourceMessageUuid: operation.sourceMessageUuid, firstObservedAt: now, lastConfirmedAt: base.confidence >= 0.8 ? now : undefined } };
  }
  if (!existing) return { action: "none", reason: "Cannot invalidate a missing memory." };
  if (operation.operation === "invalidate") return { action: "invalidate", record: { ...existing, status: "invalidated", updatedAt: now } as MemoryRecord };
  if (operation.operation === "confirm") return { action: "confirm", record: { ...existing, memoryValue: base.memoryValue, confidence: base.confidence, status: "confirmed", lastConfirmedAt: now } };
  if (normalizeMemoryKey(existing.memoryKey) === normalizeMemoryKey(operation.key) && existing.memoryValue === base.memoryValue) return { action: "confirm", record: { ...existing, confidence: Math.max(existing.confidence, base.confidence), status: "confirmed", lastConfirmedAt: now } };
  return { action: "update", record: { ...existing, memoryKey: base.memoryKey, memoryValue: base.memoryValue, confidence: base.confidence, status: base.confidence >= 0.8 ? "confirmed" : "inferred", sourceMessageUuid: operation.sourceMessageUuid, lastConfirmedAt: base.confidence >= 0.8 ? now : existing.lastConfirmedAt } };
}