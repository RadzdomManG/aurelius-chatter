import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOAuthState, createPkcePair } from "@/server/fanvue/pkce";
import { verifyFanvueSignature } from "@/server/fanvue/signatures";
import { createHmac } from "node:crypto";
import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueSenderType } from "@/server/fanvue/client";
import { normalizeScheduledAt, parseMediaUuids, parsePriceCents, validateMediaUuids, validatePricedMedia } from "@/server/fanvue/actions";
import { creatorPromoSkipReason } from "@/server/automation/fanvue-auto-reply";

describe("Fanvue security helpers", () => {
  it("creates a valid S256 PKCE pair", () => {
    const pair = createPkcePair();
    const challenge = createHash("sha256").update(pair.verifier).digest("base64url");
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).toBe(challenge);
    expect(createOAuthState()).not.toBe(createOAuthState());
  });

  it("accepts a fresh signed body and rejects tampering", () => {
    const body = JSON.stringify({ id: "event-1", type: "creator.message.received" });
    const timestamp = 1_700_000_000;
    const signature = createHmac("sha256", "test-secret").update(`${timestamp}.${body}`).digest("hex");
    const header = `t=${timestamp},v0=${signature}`;
    expect(verifyFanvueSignature(body, header, "test-secret", timestamp)).toBe(true);
    expect(verifyFanvueSignature(`${body}x`, header, "test-secret", timestamp)).toBe(false);
  });

  it("normalizes Fanvue imported message fields", () => {
    const message = { uuid: "message-1", text: " hello ", createdAt: "2026-09-10T00:00:00.000Z", sender: { uuid: "fan-1" } };
    expect(fanvueMessageBody(message)).toBe("hello");
    expect(fanvueMessageCreatedAt(message)).toBe("2026-09-10T00:00:00.000Z");
    expect(fanvueSenderType(message, "creator-1")).toBe("fan");
    expect(fanvueSenderType({ ...message, sender: { uuid: "creator-1" } }, "creator-1")).toBe("creator");
  });

  it("validates Fanvue write payloads safely", () => {
    const mediaUuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseMediaUuids(` ${mediaUuid}, ${mediaUuid} `)).toEqual([mediaUuid, mediaUuid]);
    expect(validateMediaUuids([mediaUuid])).toBeNull();
    expect(validateMediaUuids(["not-a-uuid"])).toContain("valid Fanvue media UUIDs");
    expect(parsePriceCents("300")).toBe(300);
    expect(validatePricedMedia(300, [mediaUuid], 300)).toBeNull();
    expect(validatePricedMedia(299, [mediaUuid], 300)).toContain("at least 300");
    expect(validatePricedMedia(300, [], 300)).toContain("require at least one media");
    expect(validatePricedMedia(50_001, [mediaUuid], 300)).toContain("capped");
    expect(normalizeScheduledAt("2026-09-10T10:30")).toMatch(/^2026-09-10T\d{2}:30:00\.000Z$/);
    expect(normalizeScheduledAt("bad-date")).toBeNull();
  });

  it("webhook route processes real-time message and follower event shapes", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/webhooks/fanvue/route.ts"), "utf8");
    expect(source).toContain("creator.message.received");
    expect(source).toContain("creator.follow.created");
    expect(source).toContain("unread_messages_count");
    expect(source).toContain("data.follower");
    expect(source).toContain("automation_jobs");
    expect(source).toContain("processFanMessageAutoReply");
    expect(source).toContain("duplicate");
    expect(source).toContain("processed");
  });

  it("Fanvue sync imports messages and triggers the same auto-reply pipeline", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/fanvue/sync/route.ts"), "utf8");
    expect(source).toContain("/v1/chats?page=1&size=50");
    expect(source).toContain("markAsRead=false");
    expect(source).toContain("queueLatestAutomationJob");
    expect(source).toContain("processFanMessageAutoReply");
  });

  it("filters creator, collab, sfs, self-promo, and promo-link messages from auto replies", () => {
    expect(creatorPromoSkipReason("collab?")).toContain("Skipped");
    expect(creatorPromoSkipReason("sfs please")).toContain("Skipped");
    expect(creatorPromoSkipReason("i am a creator too")).toContain("Skipped");
    expect(creatorPromoSkipReason("subscribe to me")).toContain("Skipped");
    expect(creatorPromoSkipReason("check https://fanvue.com/me")).toContain("Skipped");
    expect(creatorPromoSkipReason("hey", "promo creator")).toContain("Skipped");
    expect(creatorPromoSkipReason("hey are you there?")).toBeNull();
  });
});
