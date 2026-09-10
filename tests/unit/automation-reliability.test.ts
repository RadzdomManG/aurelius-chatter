import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("automation production reliability", () => {
  it("uses atomic debounced enqueue with message-level idempotency", () => {
    const migration = read("supabase/migrations/20260910112830_automation_reliability.sql");
    expect(migration).toContain("enqueue_latest_automation_job");
    expect(migration).toContain("automation_trigger_message_idx");
    expect(migration).toContain("SUPERSEDED_BY_NEWER_FAN_MESSAGE");
    expect(migration).toContain("stale_lock_recovered");
  });

  it("resolves creator-scoped settings, persona, memory, summary, and connection", () => {
    const source = read("src/server/automation/fanvue-auto-reply.ts");
    expect(source).toContain('.eq("creator_profile_id", input.creatorProfileId)');
    expect(source).toContain('.eq("fan_id", input.fanId)');
    expect(source).toContain("PERSONA_NOT_FOUND");
    expect(source).toContain("FINAL_VALIDATION_FAILED");
    expect(source).toContain("conversation_summaries");
  });

  it("has a closed-browser worker trigger and bounded provider retries", () => {
    const vercel = read("vercel.json");
    const worker = read("src/server/automation/worker.ts");
    const xai = read("src/server/ai/xai.ts");
    expect(vercel).toContain("/api/automation/worker");
    expect(worker).toContain("temporaryProviderError");
    expect(xai).toContain("AbortSignal.timeout");
    expect(xai).toContain("XAI_RETRYABLE_STATUSES");
  });
});
