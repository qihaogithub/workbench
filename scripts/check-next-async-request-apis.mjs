#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const sourceRoot = "packages/author-site/src";
const ignoredTestFiles = ["--glob", "!**/*.test.*", "--glob", "!**/__tests__/**"];
const rules = [
  {
    label: "codemod migration markers",
    args: ["-n", "UnsafeUnwrapped|@next-codemod-error", sourceRoot],
  },
  {
    label: "synchronous next/headers CookieStore access",
    args: ["-n", "cookies\\(\\)\\.(get|set|delete)", ...ignoredTestFiles, sourceRoot],
  },
  {
    label: "synchronous next/headers Headers access",
    args: ["-n", "headers\\(\\)\\.", ...ignoredTestFiles, sourceRoot],
  },
  {
    label: "synchronous auth Cookie helper invocation",
    args: [
      "-n",
      "--pcre2",
      "(?<!await )(getAuthCookie|setAuthCookie|clearAuthCookie)\\(",
      ...ignoredTestFiles,
      `${sourceRoot}/app`,
      `${sourceRoot}/lib/comment-auth.ts`,
      `${sourceRoot}/lib/design-specs/route-helpers.ts`,
    ],
  },
];

let failed = false;
for (const rule of rules) {
  const result = spawnSync("rg", rule.args, { encoding: "utf8" });
  if (result.status === 1) continue;
  if (result.status !== 0) {
    console.error(`无法执行 ${rule.label}: ${result.stderr || result.error}`);
    process.exitCode = 1;
    continue;
  }

  failed = true;
  console.error(`发现 ${rule.label}:\n${result.stdout}`);
}

const dynamicPageContracts = [
  {
    file: `${sourceRoot}/app/demo/[id]/edit/page.tsx`,
    patterns: [/params:\s*Promise<\{\s*id: string;/, /use\(params\)/],
  },
  {
    file: `${sourceRoot}/app/embed/[demoId]/page.tsx`,
    patterns: [/params:\s*Promise<\{\s*demoId: string/, /await params/],
  },
];

for (const contract of dynamicPageContracts) {
  const text = await readFile(contract.file, "utf8");
  if (contract.patterns.every((pattern) => pattern.test(text))) continue;
  failed = true;
  console.error(`动态页面未满足 Async Request API 合同: ${contract.file}`);
}

if (failed) {
  console.error("Next Async Request APIs 静态检查失败。");
  process.exitCode = 1;
} else {
  console.log("Next Async Request APIs 静态检查通过。");
}
