import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const editId = process.argv[2];

if (!editId) {
  console.error("Usage: node tmp/pdfs/convert-challenge-pages-to-jsx-preserve.mjs <editId>");
  process.exit(1);
}

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "tmp/pdfs/challenge-code-pages");
const outputDir = path.join(rootDir, "tmp/pdfs/challenge-jsx-pages");
const cliPath = path.join(rootDir, "packages/project-cli/bin/ow.mjs");

fs.mkdirSync(outputDir, { recursive: true });

const pageFiles = fs
  .readdirSync(sourceDir)
  .filter((name) => /^prototype-\d+\.tsx$/.test(name))
  .sort((a, b) => a.localeCompare(b));

const forbiddenPattern =
  /import type|interface |satisfies|ReactNode|CSSProperties|react\/jsx-runtime|data:image|<img|PROTOTYPE_IMAGE_SRC|challenge-prototype/;

let updated = 0;

for (const fileName of pageFiles) {
  const pageId = fileName.replace(/\.tsx$/, "");
  const inputPath = path.join(sourceDir, fileName);
  const outputPath = path.join(outputDir, fileName);
  const input = fs.readFileSync(inputPath, "utf8");
  const output =
    "// 代码化还原版本：保留 JSX，由创作端预览编译器统一转换；已去除 TypeScript 类型语法。\n" +
    ts.transpileModule(input, {
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        removeComments: false,
      },
    }).outputText;

  if (forbiddenPattern.test(output)) {
    throw new Error(`Unexpected unsupported syntax or screenshot fallback in ${fileName}`);
  }

  fs.writeFileSync(outputPath, output);
  execFileSync("node", [cliPath, "page", "update-code", editId, pageId, "--code", `@${outputPath}`, "--json"], {
    cwd: rootDir,
    stdio: "pipe",
    encoding: "utf8",
  });
  updated += 1;
}

console.log(JSON.stringify({ editId, updated, outputDir }, null, 2));
