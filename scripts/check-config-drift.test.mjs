import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkConfigDrift, main } from "./check-config-drift.mjs";

const TOPOLOGY_SOURCE = `
export const WORKBENCH_TOPOLOGY = {
  local: {
    author: 4200,
    agent: 4201,
    screenshot: 4202,
    knowledge: 4203,
    viewer: 4300,
    sketch: 3400,
  },
  docker: {
    author: 3200,
    agent: 3201,
    screenshot: 3202,
    knowledge: 3203,
    viewer: 3300,
  },
};
`;

function createFixture(extraFiles = {}, options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "config-drift-fixture-"));
  const files = {
    "package.json": JSON.stringify({
      name: "fixture",
      packageManager: "pnpm@8.15.0",
      engines: { node: ">=24.0.0 <25" },
      pnpm: { overrides: { example: "1.0.0" } },
    }),
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "packages/runtime-config/src/topology.ts": TOPOLOGY_SOURCE,
    ".env.docker.example": [
      "APP_DATA_DIR=/opt/workbench/data",
      "JWT_SECRET=",
      "MODEL_CONFIG_ENCRYPTION_KEY=",
      "EXTERNAL_AUTH_ENCRYPTION_KEY=",
    ].join("\n"),
    "test/创作端E2E回归测试/support/e2e-config.ts": "export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';\n",
    "scripts/config-drift-allowlist.json": JSON.stringify({
      directUsage: {},
      configFiles: {},
    }),
    ...extraFiles,
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return {
    root,
    options: { gitTrackedPaths: options.gitTrackedPaths ?? [] },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function messages(issues) {
  return issues.map((item) => `${item.file}:${item.line}: ${item.message}`);
}

test("clean fixture passes and every diagnostic has file and line", () => {
  const fixture = createFixture();
  try {
    const issues = checkConfigDrift(fixture.root, fixture.options);
    assert.deepEqual(issues, []);
  } finally {
    fixture.cleanup();
  }
});

test("reports independent configuration conflicts without printing secret values", () => {
  const fixture = createFixture({
    "pnpm-workspace.yaml": "packages:\n  - packages/*\noverrides:\n  example: 1.0.0\n",
    "packages/bad/package.json": JSON.stringify({
      dependencies: {
        typescript: "^5.3.3",
        "@playwright/test": "^1.42.0",
        vitest: "^1.6.1",
      },
      pnpm: { overrides: { bad: "1.0.0" } },
    }),
    ".env.example": "AUTHOR_SITE_URL=http://localhost:3200\n",
    ".env.docker.example": "JWT_SECRET=sk-live-template-value\n",
    "packages/bad/src/model.ts": "const config = { blacklist: [] };\nconst key = process.env.DATA_DIR;\n",
    "packages/bad/postcss.config.js": "export default {};\n",
    "packages/bad/postcss.config.mjs": "export default {};\n",
    "test/创作端E2E回归测试/bad.spec.ts": [
      "const target = 'http://localhost:3200';",
      "const credentials = { username: 'test', password: 'hard-coded' };",
    ].join("\n"),
  });
  try {
    const issues = checkConfigDrift(fixture.root, { gitTrackedPaths: [".env.docker"] });
    const output = messages(issues).join("\n");
    assert.ok(output.includes("pnpm-workspace.yaml:3:"));
    assert.ok(output.includes("packages/bad/package.json:1:"));
    assert.ok(output.includes(".env.example:1:"));
    assert.ok(output.includes(".env.docker.example:1:"));
    assert.ok(output.includes("packages/bad/src/model.ts:1:"));
    assert.ok(output.includes("packages/bad/postcss.config.js:1:"));
    assert.ok(output.includes("test/创作端E2E回归测试/bad.spec.ts:1:"));
    assert.ok(output.includes(".env.docker:1:"));
    assert.ok(issues.every((item) => item.file && Number.isInteger(item.line) && item.line > 0));
    assert.ok(!output.includes("sk-live-template-value"));
    assert.ok(!output.includes("hard-coded"));
  } finally {
    fixture.cleanup();
  }
});

test("allows only exact, explicitly registered direct usage and config differences", () => {
  const allowlist = {
    directUsage: {
      DATA_DIR: ["packages/legacy/src/config.ts"],
      CDN: ["packages/legacy/src/cdn.ts"],
    },
    configFiles: {
      tsconfig: ["packages/a/tsconfig.json", "packages/b/tsconfig.json"],
    },
  };
  const fixture = createFixture({
    "scripts/config-drift-allowlist.json": JSON.stringify(allowlist, null, 2),
    "packages/legacy/src/config.ts": "export const dataDir = process.env.DATA_DIR;\n",
    "packages/legacy/src/cdn.ts": "export const cdn = process.env.CDN_BASE_URL;\n",
    "packages/a/tsconfig.json": "{}\n",
    "packages/b/tsconfig.json": "{}\n",
  });
  try {
    assert.deepEqual(checkConfigDrift(fixture.root, fixture.options), []);
  } finally {
    fixture.cleanup();
  }
});

test("detects an unregistered duplicate even when other config differences are allowlisted", () => {
  const fixture = createFixture({
    "scripts/config-drift-allowlist.json": JSON.stringify({
      directUsage: {},
      configFiles: { tsconfig: ["packages/a/tsconfig.json"] },
    }),
    "packages/a/tsconfig.json": "{}\n",
    "packages/b/tsconfig.json": "{}\n",
  });
  try {
    const issues = checkConfigDrift(fixture.root, fixture.options);
    assert.ok(messages(issues).some((message) => message.startsWith("packages/b/tsconfig.json:1:")));
  } finally {
    fixture.cleanup();
  }
});

test("CLI returns exit code 1 for drift and 0 for help", () => {
  const fixture = createFixture({ "pnpm-workspace.yaml": "overrides:\n  bad: 1.0.0\n" });
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    assert.equal(main(["--root", fixture.root]), 1);
    assert.equal(main(["--help"]), 0);
  } finally {
    console.error = originalError;
    console.log = originalLog;
    fixture.cleanup();
  }
});

test("tracked Docker env is reported while the template remains value-safe", () => {
  const fixture = createFixture({}, { gitTrackedPaths: [".env.docker"] });
  try {
    writeFileSync(path.join(fixture.root, ".env.docker"), "JWT_SECRET=not printed\n");
    const issues = checkConfigDrift(fixture.root, fixture.options);
    assert.ok(messages(issues).some((message) => message.startsWith(".env.docker:1:")));
    assert.equal(readFileSync(path.join(fixture.root, ".env.docker.example"), "utf8").includes("not printed"), false);
  } finally {
    fixture.cleanup();
  }
});
