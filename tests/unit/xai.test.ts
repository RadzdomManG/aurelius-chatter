import { afterEach, describe, expect, it, vi } from "vitest";
import { generateReplyDecision } from "@/server/ai/xai";
import type { MemoryContext } from "@/domain/memory/types";

const context: MemoryContext = {
  safetyRules: "safe",
  persona: "warm",
  latestFanMessage: "hey",
  recentMessages: ["fan: hi", "fan: hey"],
  relevantMemories: [],
  rollingSummary: "",
  unresolvedItems: [],
  approvedKnowledge: "",
};

describe("xAI cost controls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the affordable Grok fallback and max output tokens", async () => {
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    vi.stubEnv("XAI_MODEL", "");
    vi.stubEnv("XAI_MAX_OUTPUT_TOKENS", "123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "reply", replyText: "hey", conversationStage: "new", intent: "greeting", sentiment: "neutral", confidence: 0.8, suggestedOfferId: null, handoffReason: null, riskFlags: [] }) } }],
    })));

    await generateReplyDecision(context);

    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { model: string; max_tokens: number; messages: Array<{ content: string }> };
    expect(request.model).toBe("grok-4.3");
    expect(request.max_tokens).toBe(123);
    expect(request.messages[0]?.content).not.toContain("Latest fan message");
  });
});
