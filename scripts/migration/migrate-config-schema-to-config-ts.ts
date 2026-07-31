/**
 * 存量迁移脚本：将现有的 config.schema.json 转换为 config.ts
 *
 * 用法：
 *   corepack pnpm tsx scripts/migration/migrate-config-schema-to-config-ts.ts [--dry-run] [--verify]
 *
 * 选项：
 *   --dry-run  仅预览，不写入文件
 *   --verify   写入后编译验证，确保 config.ts → config.schema.json 编译结果与原始一致
 */

import * as fs from "fs";
import * as path from "path";
import { decompileSchema, compileConfigTs } from "../../packages/shared/src/config-compiler";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verify = args.includes("--verify");

interface MigrationEntry {
  schemaPath: string;
  tsTargetPath: string;
  reason?: string;
}

interface MigrationResult {
  total: number;
  skipped: number;
  written: number;
  failed: number;
  entries: Array<{
    path: string;
    status: "skipped" | "written" | "failed" | "verified";
    reason?: string;
  }>;
}

function findConfigSchemas(rootDir: string): MigrationEntry[] {
  const entries: MigrationEntry[] = [];

  function walk(dir: string) {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        if (item.name === "node_modules" || item.name === ".git") continue;
        if (item.name === "snapshots") continue;
        if (item.name === ".workbench") continue;
        walk(fullPath);
        continue;
      }

      if (
        item.name === "config.schema.json" ||
        item.name === "project.config.schema.json"
      ) {
        const tsFileName = item.name === "project.config.schema.json"
          ? "project.config.ts"
          : "config.ts";
        const tsTargetPath = path.join(path.dirname(fullPath), tsFileName);

        if (fs.existsSync(tsTargetPath)) {
          entries.push({
            schemaPath: fullPath,
            tsTargetPath,
            reason: `config.ts 已存在，跳过`,
          });
        } else {
          entries.push({ schemaPath: fullPath, tsTargetPath });
        }
      }
    }
  }

  // 遍历 projects 和 workspaces 目录
  const projectsDir = path.join(rootDir, "projects");
  if (fs.existsSync(projectsDir)) walk(projectsDir);
  const workspacesDir = path.join(rootDir, "workspaces");
  if (fs.existsSync(workspacesDir)) walk(workspacesDir);

  return entries;
}

function deepSchemaEqual(aIn: unknown, bIn: unknown, path: string = ""): boolean {
  if (aIn === bIn) return true;
  if (typeof aIn !== typeof bIn) return false;
  if (aIn === null || bIn === null) return aIn === bIn;
  if (typeof aIn !== "object" || typeof bIn !== "object") return false;

  if (Array.isArray(aIn) && Array.isArray(bIn)) {
    if (aIn.length !== bIn.length) return false;
    return aIn.every((v, i) => deepSchemaEqual(v, bIn[i], `${path}[${i}]`));
  }
  if (Array.isArray(aIn) || Array.isArray(bIn)) return false;

  const aObj = aIn as Record<string, unknown>;
  const bObj = bIn as Record<string, unknown>;

  const keysA = Object.keys(aObj).filter(
    (k) => k !== "title" && k !== "$schema",
  );
  const keysB = Object.keys(bObj).filter(
    (k) => k !== "title" && k !== "$schema",
  );
  const keysASet = new Set(keysA);
  const keysBSet = new Set(keysB);

  for (const k of keysA) {
    if (!keysBSet.has(k)) {
      if (k === "required" && aObj[k] !== undefined) {
        const arr = aObj[k] as unknown[];
        if (arr.length === 0) continue;
      }
      return false;
    }
  }
  for (const k of keysB) {
    if (!keysASet.has(k)) {
      if (k === "required" && bObj[k] !== undefined) {
        const arr = bObj[k] as unknown[];
        if (arr.length === 0) continue;
      }
      return false;
    }
  }

  const commonKeys = new Set([...keysASet].filter((k) => keysBSet.has(k)));
  return [...commonKeys].every((k) =>
    deepSchemaEqual(aObj[k], bObj[k], `${path}.${k}`),
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  return deepSchemaEqual(a, b);
}

async function main() {
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`模式: ${dryRun ? "dry-run (预览)" : "正式执行"}`);
  console.log(`验证: ${verify ? "是" : "否"}`);
  console.log("");

  const entries = findConfigSchemas(DATA_DIR);

  const result: MigrationResult = {
    total: entries.length,
    skipped: 0,
    written: 0,
    failed: 0,
    entries: [],
  };

  for (const entry of entries) {
    if (entry.reason) {
      result.skipped++;
      result.entries.push({
        path: entry.schemaPath,
        status: "skipped",
        reason: entry.reason,
      });
      console.log(`⏭  SKIP: ${entry.schemaPath} — ${entry.reason}`);
      continue;
    }

    try {
      const schemaContent = fs.readFileSync(entry.schemaPath, "utf-8");

      const tsContent = decompileSchema(schemaContent);

      if (verify) {
        const recompiledObj = JSON.parse(compileConfigTs(tsContent));
        const originalObj = JSON.parse(schemaContent);

        if (!deepEqual(originalObj, recompiledObj)) {
          result.failed++;
          result.entries.push({
            path: entry.schemaPath,
            status: "failed",
            reason: "编译验证不通过：反编译再编译后与原始 schema 不一致",
          });
          console.log(
            `❌ FAIL: ${entry.schemaPath} — 编译验证不通过`,
          );
          console.log(`   原始: ${schemaContent.substring(0, 200)}`);
          console.log(`   再编译: ${compileConfigTs(tsContent).substring(0, 200)}`);
          continue;
        }
      }

      if (!dryRun) {
        fs.writeFileSync(entry.tsTargetPath, tsContent, "utf-8");
      }

      result.written++;
      result.entries.push({
        path: entry.schemaPath,
        status: verify ? "verified" : "written",
      });
      console.log(
        `${verify ? "✅" : "✏️ "} ${dryRun ? "DRY-RUN" : "WRITE"}: ${entry.schemaPath} → ${path.relative(DATA_DIR, entry.tsTargetPath)}`,
      );
    } catch (err) {
      result.failed++;
      result.entries.push({
        path: entry.schemaPath,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
      console.log(
        `❌ FAIL: ${entry.schemaPath} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("");
  console.log("====== 迁移汇总 ======");
  console.log(`总计: ${result.total} 个 schema 文件`);
  console.log(`已跳过 (config.ts 已存在): ${result.skipped}`);
  console.log(`已写入: ${result.written}${dryRun ? " (dry-run)" : ""}`);
  console.log(`失败: ${result.failed}`);

  if (dryRun && result.written > 0) {
    console.log("");
    console.log("💡 使用以下命令正式执行迁移:");
    console.log("   corepack pnpm tsx scripts/migration/migrate-config-schema-to-config-ts.ts --verify");
  }

  if (result.failed > 0) {
    console.log("");
    console.log("⚠️  存在失败项，请检查上面日志。");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("迁移脚本执行失败:", err);
  process.exit(1);
});
