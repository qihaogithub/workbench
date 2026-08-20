import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewerAppSource = readFileSync(
  resolve(process.cwd(), "src/components/ViewerApp.tsx"),
  "utf8",
);

describe("viewer config panel contract", () => {
  it("设计规范与创作端一样内联在配置项下，不启用旧的定位 Tab", () => {
    expect(viewerAppSource).toContain("designSpecEntries={designSpecEntries}");
    expect(viewerAppSource).not.toContain('sectionNavigation="anchorTabs"');
  });
});
