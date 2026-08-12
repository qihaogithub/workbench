#!/usr/bin/env node
/**
 * export-opinions.mjs — 评审意见回流导出
 *
 * 读取创作端项目中的评论（data/projects/<projectId>/comments.json），
 * 结合 project.json 的 demoPages（pageId → routeKey）与原型页根节点 data-route，
 * 生成可供 agent 在开发项目里逐条消费的意见 JSON。
 *
 * 意见契约（评审闭环公因子）：
 *   {
 *     pageId, routeKey, threadId,
 *     anchor: { domPath, pin: { xRatio, yRatio }, textSnippet },
 *     text, createdAt, resolved, status
 *   }
 *
 * 用法：
 *   node bin/export-opinions.mjs \
 *     --project <projectId> \
 *     --data-dir <repo>/data \
 *     [--only-unresolved] \
 *     [--output opinions.json]
 *
 * 默认只导出未解决评论；加 --all 导出全部。--output 缺省时 stdout 输出 JSON。
 */
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=");
    const value =
      inlineValue !== undefined
        ? inlineValue
        : argv[i + 1] && !argv[i + 1].startsWith("--")
          ? argv[++i]
          : "true";
    args[key] = value;
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args.project;
  const dataDir = args["data-dir"] || "data";
  if (!projectId) {
    console.error("缺少 --project <projectId>");
    process.exit(1);
  }

  const projectDir = path.join(dataDir, "projects", projectId);
  const project = readJson(path.join(projectDir, "project.json"));
  const comments = readJson(path.join(projectDir, "comments.json"));

  if (!project) {
    console.error(`项目不存在：${projectDir}`);
    process.exit(1);
  }

  // pageId -> routeKey（prototype 页面由 normalize 注入 routeKey）
  const routeByPageId = new Map();
  for (const page of project.demoPages || []) {
    if (page.routeKey) routeByPageId.set(page.id, page.routeKey);
  }

  const threads = comments && Array.isArray(comments.threads) ? comments.threads : [];
  const onlyUnresolved = args["only-unresolved"] !== undefined
    ? args["only-unresolved"] !== "false"
    : !args.all;

  const opinions = [];
  for (const thread of threads) {
    const routeKey = routeByPageId.get(thread.pageId);
    if (onlyUnresolved && thread.resolved) continue;
    opinions.push({
      pageId: thread.pageId,
      routeKey: routeKey || null,
      threadId: thread.id,
      anchor: {
        domPath: thread.anchor?.domPath ?? null,
        pin: thread.pin ?? null,
        textSnippet: thread.anchor?.textSnippet ?? undefined,
      },
      text: thread.content,
      createdAt: thread.createdAt,
      resolved: !!thread.resolved,
      status: thread.resolved ? "resolved" : "pending",
    });
  }

  opinions.sort((a, b) => (a.routeKey || "").localeCompare(b.routeKey || "") || a.createdAt - b.createdAt);

  const result = {
    projectId,
    exportedAt: Date.now(),
    contract: "routeKey",
    count: opinions.length,
    opinions,
  };

  if (args.output) {
    fs.writeFileSync(args.output, JSON.stringify(result, null, 2), "utf-8");
    console.error(`[export-opinions] 已导出 ${opinions.length} 条意见 -> ${args.output}`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
}

main();