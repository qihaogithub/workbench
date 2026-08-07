#!/usr/bin/env node

/**
 * 迁移脚本：把配置项备注（config.schema.json 属性级 $demo.note）聚合为页面配置要求文档。
 *
 * 产物：每个页面生成 demos/{pageId}/requirements.md，内容为 Markdown，
 * 每个被备注的配置项生成一个 `## {名称}` 小节，并写入行内软引用 `@[名称](key)`。
 *
 * 用法：
 *   node scripts/migrate-config-notes-to-page-requirements.mjs            # 只报告，不写入
 *   node scripts/migrate-config-notes-to-page-requirements.mjs --apply    # 实际写入 requirements.md
 *   node scripts/migrate-config-notes-to-page-requirements.mjs --data-dir <path>
 *
 * 说明：本项目未上线、无需向后兼容。迁移后建议在代码层下线 $demo.note 字段。
 * 本脚本默认不删除旧 $demo.note，避免一次性破坏数据；由后续代码下线统一移除。
 */

import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dataArgIndex = process.argv.indexOf("--data-dir");
const dataDir = path.resolve(
  dataArgIndex >= 0 && process.argv[dataArgIndex + 1]
    ? process.argv[dataArgIndex + 1]
    : process.env.DATA_DIR ?? "data",
);
const projectsDir = path.join(dataDir, "projects");

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

if (!fs.existsSync(projectsDir)) {
  console.log(
    JSON.stringify({ ok: true, applied: apply, dataDir, pages: [], message: "没有项目目录" }),
  );
  process.exit(0);
}

/** 从一行注记里挑出简短的标题，避免整段 Markdown 塞进标题。 */
function excerpt(text, max = 40) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  const firstLine = trimmed.split(/\r?\n/)[0];
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

const pages = [];
for (const projectEntry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
  if (!projectEntry.isDirectory()) continue;
  const demosDir = path.join(projectsDir, projectEntry.name, "workspace", "demos");
  if (!fs.existsSync(demosDir)) continue;
  for (const pageEntry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    if (!pageEntry.isDirectory()) continue;
    const demoDir = path.join(demosDir, pageEntry.name);
    const schema = readJson(path.join(demoDir, "config.schema.json"));
    if (!schema || typeof schema !== "object") continue;
    const properties = schema.properties;
    if (!properties || typeof properties !== "object") continue;

    const noted = [];
    for (const [key, prop] of Object.entries(properties)) {
      const note =
        prop && typeof prop === "object" && prop.$demo && prop.$demo.note
          ? prop.$demo.note
          : null;
      if (!note) continue;
      const displayName =
        typeof prop.title === "string" && prop.title.trim()
          ? prop.title.trim()
          : key;
      noted.push({ key, displayName, note });
    }
    if (noted.length === 0) continue;

    const reqPath = path.join(demoDir, "requirements.md");
    const existing = fs.existsSync(reqPath) ? fs.readFileSync(reqPath, "utf8") : "";

    const sections = noted.map(({ key, displayName, note }) => {
      const heading = excerpt(note) || displayName;
      const refLine = `@[${displayName}](${key})`;
      return `## ${heading}\n\n${refLine}\n\n${note.trim()}\n`;
    });
    const content = `# ${pageEntry.name} 配置要求\n\n由旧配置项备注迁移生成。\n\n${sections.join("\n---\n\n")}`;

    if (apply) {
      fs.writeFileSync(reqPath, existing ? `${existing}\n\n---\n\n${content}` : content, "utf8");
    }

    pages.push({
      projectId: projectEntry.name,
      pageId: pageEntry.name,
      notedCount: noted.length,
      written: apply,
      hadExisting: Boolean(existing),
    });
  }
}

console.log(JSON.stringify({ ok: true, applied: apply, dataDir, pages }, null, 2));