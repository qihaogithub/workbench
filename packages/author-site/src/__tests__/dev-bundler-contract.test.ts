import fs from "node:fs";
import path from "node:path";

const authorSiteRoot = path.resolve(__dirname, "../..");

describe("author-site bundler contract", () => {
  it("uses Turbopack for daily development while keeping Webpack production builds", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(authorSiteRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.dev).toContain("next dev --turbopack");
    expect(packageJson.scripts?.["dev:turbo"]).toBe(packageJson.scripts?.dev);
    expect(packageJson.scripts?.["dev:webpack"]).toContain("next dev --webpack");
    expect(packageJson.scripts?.build).toContain("next build --webpack");
    expect(packageJson.scripts?.["build:webpack"]).toBe(
      packageJson.scripts?.build,
    );
  });
});
