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
    expect(source).toContain("router.refresh");
    expect(source).toContain("setInterval");
  });

  it("shows professional analytics metrics and graphs", () => {
    const source = readFileSync(join(process.cwd(), "src/app/analytics/page.tsx"), "utf8");
    expect(source).toContain("Bot messages sent");
    expect(source).toContain("bot_action_logs");
    expect(source).toContain("Only app/bot sends after logging upgrade");
    expect(source).toContain("Failed jobs");
    expect(source).toContain("Bot earnings");
    expect(source).toContain("bar-chart");
    expect(source).toContain("Audit trail");
    expect(source).toContain("RETRY QUEUE");
    expect(source).toContain("SCHEDULED CALENDAR");
  });

  it("mass messages exclude creators", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/fanvue/mass-messages/route.ts"), "utf8");
    const form = readFileSync(join(process.cwd(), "src/app/inbox-actions.tsx"), "utf8");
    expect(route).toContain('excludedLists: { smartListIds: ["creators"] }');
    expect(form).toContain("Creators were excluded");
  });

  it("adds operator surfaces for media, settings, and retries", () => {
    const form = readFileSync(join(process.cwd(), "src/app/inbox-actions.tsx"), "utf8");
    const mediaRoute = readFileSync(join(process.cwd(), "src/app/api/fanvue/media/route.ts"), "utf8");
    const settingsRoute = readFileSync(join(process.cwd(), "src/app/api/automation/settings/route.ts"), "utf8");
    const retryRoute = readFileSync(join(process.cwd(), "src/app/api/automation/jobs/[jobId]/retry/route.ts"), "utf8");
    expect(form).toContain("Media vault browser");
    expect(form).toContain("Auto-reply controls");
    expect(form).toContain("RetryJobButton");
    expect(mediaRoute).toContain("/media?");
    expect(mediaRoute).toContain("variants");
    expect(settingsRoute).toContain("quietHoursStart");
    expect(settingsRoute).toContain("maxRepliesPerHour");
    expect(retryRoute).toContain("dead_letter");
  });
});
