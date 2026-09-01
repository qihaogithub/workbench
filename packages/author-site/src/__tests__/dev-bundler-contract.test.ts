import fs from "node:fs";
import path from "node:path";

const authorSiteRoot = path.resolve(__dirname, "../..");

describe("author-site bundler contract", () => {
  it("uses Turbopack for daily development while keeping Webpack production builds", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(authorSiteRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.dev).toContain("run-next-with-root-env.mjs");
    expect(packageJson.scripts?.dev).toContain("--turbopack");
    expect(packageJson.scripts?.["dev:turbo"]).toBe(packageJson.scripts?.dev);
    expect(packageJson.scripts?.["dev:webpack"]).toContain("run-next-with-root-env.mjs");
    expect(packageJson.scripts?.["dev:webpack"]).toContain("--webpack");
    expect(packageJson.scripts?.build).toContain("run-next-with-root-env.mjs");
    expect(packageJson.scripts?.build).toContain("build --webpack");
    expect(packageJson.scripts?.["build:webpack"]).toBe(
      packageJson.scripts?.build,
    );
  });
});
