import type { DemoPageMeta, PagePresentationProfile } from "@workbench/shared";

import { importTrustedFigmaHtmlFiles } from "./html-import-intake";

const presentation: PagePresentationProfile = {
  version: 1,
  mode: "fixed-canvas",
  viewport: { width: 1440, height: 900 },
  heightBehavior: "fixed",
  preset: "custom",
  source: "figma",
};

function file(name: string, html: string): File {
  const value = new File([html], name, { type: "text/html" });
  Object.defineProperty(value, "text", {
    configurable: true,
    value: jest.fn().mockResolvedValue(html),
  });
  return value;
}

describe("HTML import intake", () => {
  it("直接提交可信 Figma HTML，普通 HTML 才交给工作台", async () => {
    const prepareHtmlImport = jest
      .fn()
      .mockResolvedValueOnce({
        draftId: "figma-draft",
        name: "Figma 页面",
        recommendation: presentation,
        analysis: {
          source: { kind: "figma-export", confirmationBypassEligible: true },
          resourceReferences: [{ impact: "blocked" }],
        },
      })
      .mockResolvedValueOnce({
        draftId: "plain-draft",
        name: "普通页面",
        recommendation: presentation,
        analysis: {
          source: { kind: "unknown", confirmationBypassEligible: false },
          resourceReferences: [],
        },
      });
    const commitHtmlImport = jest.fn().mockResolvedValue({
      page: { id: "figma-page", name: "Figma 页面", order: 0 } as DemoPageMeta,
    });
    const cancelHtmlImport = jest.fn().mockResolvedValue(undefined);

    const result = await importTrustedFigmaHtmlFiles({
      api: { prepareHtmlImport, commitHtmlImport, cancelHtmlImport },
      projectId: "project-1",
      sessionId: "session-1",
      files: [file("figma.html", "<main>figma</main>"), file("plain.html", "<main>plain</main>")],
    });

    expect(result.imported).toEqual([
      expect.objectContaining({ page: expect.objectContaining({ id: "figma-page" }), blockedResourceCount: 1 }),
    ]);
    expect(result.remainingFiles.map((item) => item.name)).toEqual(["plain.html"]);
    expect(commitHtmlImport).toHaveBeenCalledWith(
      "project-1",
      "session-1",
      "figma-draft",
      presentation,
      "Figma 页面",
      true,
    );
    expect(cancelHtmlImport).toHaveBeenCalledWith(
      "project-1",
      "session-1",
      "plain-draft",
    );
  });
});
