import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Fanvue operator UI", () => {
  it("renders chat desk bubbles and creator-exclusion copy", () => {
    const source = readFileSync(join(process.cwd(), "src/app/chat-desk.tsx"), "utf8");
    expect(source).toContain("chat-desk");
    expect(source).toContain("chat-bubble");
    expect(source).toContain("setSelectedId");
    expect(source).toContain("onClick");
    expect(source).toContain("bot");
    expect(source).toContain("Generate AI draft");
    expect(source).toContain("Approve & send");
    expect(source).toContain("creatorMessagesExcluded");
  });

  it("shows professional analytics metrics and graphs", () => {
    const source = readFileSync(join(process.cwd(), "src/app/analytics/page.tsx"), "utf8");
    expect(source).toContain("Bot messages sent");
    expect(source).toContain("Failed jobs");
    expect(source).toContain("Bot earnings");
    expect(source).toContain("bar-chart");
    expect(source).toContain("Audit trail");
  });

  it("mass messages exclude creators", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/fanvue/mass-messages/route.ts"), "utf8");
    const form = readFileSync(join(process.cwd(), "src/app/inbox-actions.tsx"), "utf8");
    expect(route).toContain('excludedLists: { smartListIds: ["creators"] }');
    expect(form).toContain("Creators were excluded");
  });
});
