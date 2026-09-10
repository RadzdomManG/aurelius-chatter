import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("model workspace routing", () => {
  it("opens model cards by creator profile ID and isolates the Fanvue action", () => {
    const modelsPage = read("src/app/models/page.tsx");
    expect(modelsPage).toContain("router.push(`/models/${model.id}`)");
    expect(modelsPage).toContain("href={`/models/${model.id}`}");
    expect(modelsPage).toContain("event.stopPropagation()");
    expect(modelsPage).toContain("?tab=fanvue");
  });

  it("loads all workspace records through the selected creator ID", () => {
    const workspacePage = read("src/app/models/[id]/page.tsx");
    for (const table of ["creator_profiles", "persona_profiles", "automation_settings", "fanvue_connections", "fan_memories", "automation_jobs"]) {
      expect(workspacePage).toContain(table);
    }
    expect(workspacePage).toContain('.eq("creator_profile_id", id)');
    expect(workspacePage).not.toContain("redirect(");
  });

  it("keeps persona and automation saves scoped to the route model", () => {
    const modelApi = read("src/app/api/models/[id]/route.ts");
    expect(modelApi).toContain('.eq("creator_profile_id", id)');
    expect(modelApi).toContain('.eq("id", id).eq("organization_id", organizationId)');
  });
});
