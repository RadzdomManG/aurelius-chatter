import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemoryContext } from "@/domain/memory/types";

let mockSupabase: ReturnType<typeof createMockSupabase> | null = null;
const generatedPersonas: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    if (!mockSupabase) throw new Error("Mock Supabase client not configured.");
    return mockSupabase;
  }),
}));

vi.mock("@/server/ai/xai", () => ({
  XaiProviderError: class XaiProviderError extends Error {},
  generateReplyDecision: vi.fn(async (context: MemoryContext) => {
    generatedPersonas.push(context.persona);
    return {
      action: "reply",
      replyText: `using ${context.persona}`,
      conversationStage: "new",
      intent: "greeting",
      sentiment: "neutral",
      confidence: 0.8,
      suggestedOfferId: null,
      handoffReason: null,
      riskFlags: [],
    };
  }),
}));

vi.mock("@/lib/env", () => ({ xaiEnv: () => ({ model: "grok-test" }) }));

function createMockSupabase(options: { user?: { id: string } | null; organizationId?: string | null; model?: unknown; modelError?: unknown }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.user ?? { id: "user-1" } } })) },
    from: vi.fn((table: string) => {
      if (table === "organization_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: options.organizationId === undefined ? { organization_id: "org-1" } : options.organizationId ? { organization_id: options.organizationId } : null })),
        };
      }
      if (table === "creator_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: options.model ?? null, error: options.modelError ?? null })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

async function postPlayground(body: unknown) {
  const { POST } = await import("@/app/api/playground/route");
  return POST(new Request("http://localhost/api/playground", { method: "POST", body: JSON.stringify(body) }));
}

describe("Playground model testing", () => {
  afterEach(() => {
    mockSupabase = null;
    generatedPersonas.length = 0;
    vi.clearAllMocks();
  });

  it("loads the selected model persona server-side", async () => {
    mockSupabase = createMockSupabase({ model: { id: "model-a", persona_profiles: [{ id: "persona-a", display_name: "Kimi Main", instructions: "Kimi persona", active: true }] } });
    const response = await postPlayground({ modelId: "model-a", message: "hey", history: [] });
    const payload = await response.json() as { decision: { replyText: string | null }; diagnostics: { validation: string } };
    expect(response.status).toBe(200);
    expect(generatedPersonas).toEqual(["Kimi persona"]);
    expect(payload.decision.replyText).toBe("using Kimi persona");
    expect(payload.diagnostics.validation).toBe("passed");
  });

  it("uses different saved personas for different selected models", async () => {
    mockSupabase = createMockSupabase({ model: { id: "model-a", persona_profiles: [{ id: "persona-a", display_name: "Kimi Main", instructions: "Kimi persona", active: true }] } });
    await postPlayground({ modelId: "model-a", message: "hey", history: [] });
    mockSupabase = createMockSupabase({ model: { id: "model-b", persona_profiles: [{ id: "persona-b", display_name: "Rina Main", instructions: "Rina persona", active: true }] } });
    await postPlayground({ modelId: "model-b", message: "hey", history: [] });
    expect(generatedPersonas).toEqual(["Kimi persona", "Rina persona"]);
  });

  it("returns safe errors for missing or unauthorized models", async () => {
    mockSupabase = createMockSupabase({ model: null });
    const response = await postPlayground({ modelId: "other-org-model", message: "hey", history: [] });
    const payload = await response.json() as { error: string };
    expect(response.status).toBe(404);
    expect(payload.error).toBe("Model not found.");
    expect(generatedPersonas).toEqual([]);
  });

  it("returns a setup error when the selected model has no active persona", async () => {
    mockSupabase = createMockSupabase({ model: { id: "model-a", persona_profiles: [{ id: "persona-a", display_name: "Kimi Main", instructions: "Kimi persona", active: false }] } });
    const response = await postPlayground({ modelId: "model-a", message: "hey", history: [] });
    const payload = await response.json() as { error: string; setupHref: string };
    expect(response.status).toBe(409);
    expect(payload.error).toBe("This model does not have an active persona yet.");
    expect(payload.setupHref).toBe("/models");
    expect(generatedPersonas).toEqual([]);
  });

  it("keeps Playground isolated from Fanvue writes", async () => {
    mockSupabase = createMockSupabase({ model: { id: "model-a", persona_profiles: [{ id: "persona-a", display_name: "Kimi Main", instructions: "Kimi persona", active: true }] } });
    await postPlayground({ modelId: "model-a", message: "hey", history: [] });
    expect(mockSupabase.from).not.toHaveBeenCalledWith("fans");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("conversations");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("messages");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("fan_memories");
  });

  it("includes selected model UI flow and Back button wiring", () => {
    const source = readFileSync(join(process.cwd(), "src/app/playground/page.tsx"), "utf8");
    expect(source).toContain('fetch("/api/models")');
    expect(source).toContain("modelId: selectedModelId");
    expect(source).toContain("function selectModel(modelId: string) { setSelectedModelId(modelId); reset(); }");
    expect(source).toContain('href="/"');
    expect(source).toContain("Back to inbox");
  });
});
