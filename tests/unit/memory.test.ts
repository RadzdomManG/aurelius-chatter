import { describe, expect, it } from "vitest";
import { buildMemoryContext, estimateContextCharacters } from "@/domain/memory/context";
import { mergeMemory } from "@/domain/memory/merge";
import { shouldRefreshSummary } from "@/domain/memory/summary";

describe("fan memory", () => {
  it("rejects credentials and sensitive identity data", () => {
    const result = mergeMemory({ adultStatusConfirmed: true, operation: { operation: "create", category: "identity", key: "password", value: "secret-value", confidence: 1, sourceMessageUuid: "msg-1", reason: "fan stated it" } });
    expect(result.action).toBe("none");
  });

  it("merges a repeated fact by confirming the existing record", () => {
    const result = mergeMemory({ adultStatusConfirmed: true, existing: { id: "memory-1", organizationId: "org-1", creatorProfileId: "creator-1", fanId: "fan-1", category: "interest", memoryKey: "Favorite topic", memoryValue: "indie music", confidence: .7, status: "inferred", sensitivity: "normal", firstObservedAt: "2025-01-01" }, operation: { operation: "create", category: "interest", key: "favorite topic", value: "indie music", confidence: .9, sourceMessageUuid: "msg-2", reason: "confirmed again" } });
    expect(result.action).toBe("confirm");
    expect(result.record?.status).toBe("confirmed");
  });

  it("keeps the latest message and safety rules while trimming context", () => {
    const context = buildMemoryContext({ persona: "warm", latestFanMessage: "latest fan message", unresolvedItems: [], approvedKnowledge: "approved", recentMessages: Array.from({ length: 50 }, (_, index) => `message ${index}`), relevantMemories: Array.from({ length: 30 }, (_, index) => ({ id: String(index), organizationId: "org", creatorProfileId: "creator", fanId: "fan", category: "interest", memoryKey: `key-${index}`, memoryValue: "a useful fact", confidence: .8, status: "confirmed", sensitivity: "normal", firstObservedAt: "2025-01-01" })), rollingSummary: "x".repeat(5000) }, { maxRecentMessages: 10, maxMemories: 4, maxSummaryCharacters: 400, maxPromptCharacters: 1800 });
    expect(context.latestFanMessage).toBe("latest fan message");
    expect(context.safetyRules).toContain("untrusted");
    expect(context.recentMessages).toHaveLength(10);
    expect(estimateContextCharacters(context)).toBeLessThanOrEqual(1800);
  });

  it("refreshes a summary only at a checkpoint trigger", () => {
    expect(shouldRefreshSummary({ newMessages: 3, newCharacters: 200, stageChanged: false, beforeArchive: false })).toBe(false);
    expect(shouldRefreshSummary({ newMessages: 20, newCharacters: 200, stageChanged: false, beforeArchive: false })).toBe(true);
  });
});