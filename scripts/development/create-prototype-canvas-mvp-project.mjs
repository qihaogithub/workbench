#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const owBin = path.join(repoRoot, "packages/project-cli/bin/ow.mjs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prototype-canvas-mvp-"));

function runOw(args, input) {
  const inputPath = input
    ? path.join(tmpDir, `input-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    : null;
  if (inputPath) {
    fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf-8");
  }
  const fullArgs = [
    owBin,
    ...args,
    ...(inputPath ? ["--input-json", `@${inputPath}`] : []),
    "--json",
  ];
  const result = spawnSync(process.execPath, fullArgs, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, PROJECT_ADMIN_ROLE: process.env.PROJECT_ADMIN_ROLE ?? "admin" },
  });
  if (result.status !== 0) {
    throw new Error(`ow ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  const payload = JSON.parse(result.stdout.trim());
  if (!payload.ok) {
    throw new Error(`ow ${args.join(" ")} returned error\n${JSON.stringify(payload, null, 2)}`);
  }
  return payload.data;
}

function pageName(index) {
  const names = [
    "首页概览",
    "登录注册",
    "用户中心",
    "数据看板",
    "列表管理",
    "详情信息",
    "搜索筛选",
    "表单录入",
    "审批流程",
    "消息中心",
  ];
  return `${String(index + 1).padStart(2, "0")} ${names[index % names.length]}`;
}

function buildPrototype(index) {
  const hue = (index * 37) % 360;
  const cards = Array.from({ length: 4 }, (_, item) => `
    <article class="metric">
      <span>模块 ${item + 1}</span>
      <strong>${(index + 2) * (item + 3)}</strong>
      <small>流程节点 / 信息块</small>
    </article>
  `).join("");
  const rows = Array.from({ length: 6 }, (_, row) => `
    <li>
      <span>原型任务 ${row + 1}</span>
      <em>${row % 2 === 0 ? "进行中" : "待确认"}</em>
    </li>
  `).join("");
  const html = `
    <main class="screen">
      <nav class="topbar">
        <strong>${pageName(index)}</strong>
        <span>Prototype ${String(index + 1).padStart(2, "0")}</span>
      </nav>
      <section class="hero">
        <p class="eyebrow">HTML/CSS MVP</p>
        <h1>${pageName(index)}页面结构</h1>
        <p>这是用于测试画布承载大量原型页面的静态页面，内容仅表达信息层级和布局密度。</p>
      </section>
      <section class="metrics">${cards}</section>
      <section class="content">
        <div class="panel">
          <h2>关键区域</h2>
          <p>页面主体包含导航、摘要、卡片、列表和操作区，用于模拟真实产品原型的浏览压力。</p>
          <button>主要操作</button>
        </div>
        <ul class="timeline">${rows}</ul>
      </section>
    </main>
  `;
  const css = `
    .screen {
      min-height: 100%;
      padding: 28px;
      background: linear-gradient(180deg, hsl(${hue} 52% 96%), #ffffff 42%);
      color: #111827;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      font-size: 13px;
      color: #4b5563;
    }
    .topbar strong { color: #111827; font-size: 15px; }
    .hero {
      border: 1px solid #d1d5db;
      background: rgba(255, 255, 255, 0.92);
      padding: 24px;
      margin-bottom: 18px;
    }
    .eyebrow {
      margin: 0 0 8px;
      color: hsl(${hue} 68% 38%);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    p { line-height: 1.65; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .metric {
      border: 1px solid #e5e7eb;
      background: #fff;
      padding: 16px;
    }
    .metric span, .metric small { display: block; color: #6b7280; }
    .metric strong { display: block; margin: 8px 0; font-size: 26px; }
    .content {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 14px;
    }
    .panel, .timeline {
      border: 1px solid #e5e7eb;
      background: #fff;
      padding: 18px;
    }
    button {
      margin-top: 12px;
      border: 0;
      background: hsl(${hue} 64% 42%);
      color: #fff;
      padding: 10px 14px;
      font-weight: 700;
    }
    .timeline {
      list-style: none;
      margin: 0;
    }
    .timeline li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #f3f4f6;
      padding: 10px 0;
    }
    .timeline li:last-child { border-bottom: 0; }
    .timeline em { color: hsl(${hue} 64% 36%); font-style: normal; }
    @media (max-width: 520px) {
      .content, .metrics { grid-template-columns: 1fr; }
      .screen { padding: 18px; }
    }
  `;
  return { html, css };
}

try {
  runOw(["doctor"]);
  const project = runOw(["project", "create"], {
    name: "MVP-30个HTML/CSS原型页画布体验",
    description: "用于体验创作端画布承载 30 个 HTML/CSS 原型页的 MVP 测试项目",
  });
  const edit = runOw(["edit", "begin", project.id]);

  for (let index = 0; index < 30; index += 1) {
    const { html, css } = buildPrototype(index);
    runOw(["page", "create"], {
      editId: edit.editId,
      pageId: `prototype_mvp_${String(index + 1).padStart(2, "0")}`,
      routeKey: `prototype-mvp-${String(index + 1).padStart(2, "0")}`,
      name: pageName(index),
      runtimeType: "prototype-html-css",
      order: index,
      schema: JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $demo: {
          previewSize: { width: 390, height: 844 },
        },
        title: `${pageName(index)}配置`,
        type: "object",
        properties: {},
      }, null, 2),
      prototypeHtml: html,
      prototypeCss: css,
      prototypeMeta: { width: 390, height: 844, generatedBy: "prototype-canvas-mvp-seed" },
    });
  }

  runOw(["edit", "validate", edit.editId]);
  runOw(["edit", "commit", edit.editId, "--note", "创建 30 个 HTML/CSS 原型页画布体验项目"]);
  runOw(["project", "validate-runtime", project.id]);

  const url = `http://localhost:3200/demo/${project.id}/edit`;
  console.log(JSON.stringify({
    ok: true,
    projectId: project.id,
    editUrl: url,
    pageCount: 30,
  }, null, 2));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
