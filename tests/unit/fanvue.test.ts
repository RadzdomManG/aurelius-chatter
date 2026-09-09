import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createOAuthState, createPkcePair } from "@/server/fanvue/pkce";
import { verifyFanvueSignature } from "@/server/fanvue/signatures";
import { createHmac } from "node:crypto";
import { fanvueMessageBody, fanvueMessageCreatedAt, fanvueSenderType } from "@/server/fanvue/client";

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
});
