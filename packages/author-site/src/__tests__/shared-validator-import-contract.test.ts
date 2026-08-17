import fs from "node:fs";
import path from "node:path";

const authorSiteRoot = path.resolve(__dirname, "../..");
const workspaceRoot = path.resolve(authorSiteRoot, "../..");

describe("shared validator import contract", () => {
  it("exposes validator through a precise shared-package subpath", () => {
    const sharedPackageJson = JSON.parse(
      fs.readFileSync(
        path.join(workspaceRoot, "packages/shared/package.json"),
        "utf8",
      ),
    ) as { exports?: Record<string, string> };

    expect(sharedPackageJson.exports?.["./validator"]).toBe(
      "./src/validator.ts",
    );
  });

  it("keeps the author validator adapter off the shared root barrel", () => {
    const validatorSource = fs.readFileSync(
      path.join(authorSiteRoot, "lib/validator.ts"),
      "utf8",
    );

    expect(validatorSource).toContain('from "@workbench/shared/validator"');
    expect(validatorSource).not.toMatch(
      /from\s+["']@workbench\/shared["']/,
    );
  });
});
