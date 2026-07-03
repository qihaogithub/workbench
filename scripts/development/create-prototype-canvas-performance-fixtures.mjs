#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const owBin = path.join(repoRoot, "packages/project-cli/bin/ow.mjs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prototype-canvas-perf-"));
const pageCount = Number(process.env.PROTOTYPE_CANVAS_PERF_PAGE_COUNT ?? 20);

function runOw(args, input) {
  const inputPath = input
    ? path.join(tmpDir, `input-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    : null;
  if (inputPath) {
    fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf-8");
  }
  const result = spawnSync(
    process.execPath,
    [
      owBin,
      ...args,
      ...(inputPath ? ["--input-json", `@${inputPath}`] : []),
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        PROJECT_ADMIN_ROLE: process.env.PROJECT_ADMIN_ROLE ?? "admin",
      },
    },
  );
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

function buildSchema(index) {
  return JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $demo: {
        previewSize: { width: 390, height: 844 },
      },
      title: `${pageName(index)}配置`,
      type: "object",
      properties: {
        title: {
          type: "string",
          title: "标题",
          default: `${pageName(index)}页面结构`,
        },
      },
    },
    null,
    2,
  );
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
  return {
    html: `
      <main class="screen">
        <nav class="topbar">
          <strong>${pageName(index)}</strong>
          <span>Prototype ${String(index + 1).padStart(2, "0")}</span>
        </nav>
        <section class="hero">
          <p class="eyebrow">HTML/CSS Baseline</p>
          <h1 data-bind-text="title">${pageName(index)}页面结构</h1>
          <p>用于测试画布承载大量原型页面的静态页面。</p>
        </section>
        <section class="metrics">${cards}</section>
        <section class="content">
          <div class="panel">
            <h2>关键区域</h2>
            <p>页面主体包含导航、摘要、卡片、列表和操作区。</p>
            <button>主要操作</button>
          </div>
          <ul class="timeline">${rows}</ul>
        </section>
      </main>
    `,
    css: `
      .screen { min-height: 100%; padding: 28px; background: linear-gradient(180deg, hsl(${hue} 52% 96%), #fff 42%); color: #111827; }
      .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; font-size: 13px; color: #4b5563; }
      .topbar strong { color: #111827; font-size: 15px; }
      .hero { border: 1px solid #d1d5db; background: rgba(255,255,255,.92); padding: 24px; margin-bottom: 18px; }
      .eyebrow { margin: 0 0 8px; color: hsl(${hue} 68% 38%); font-size: 12px; font-weight: 700; text-transform: uppercase; }
      h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.15; }
      h2 { margin: 0 0 10px; font-size: 18px; }
      p { line-height: 1.65; }
      .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
      .metric, .panel, .timeline { border: 1px solid #e5e7eb; background: #fff; padding: 16px; }
      .metric span, .metric small { display: block; color: #6b7280; }
      .metric strong { display: block; margin: 8px 0; font-size: 26px; }
      .content { display: grid; grid-template-columns: 1.1fr .9fr; gap: 14px; }
      button { margin-top: 12px; border: 0; background: hsl(${hue} 64% 42%); color: #fff; padding: 10px 14px; font-weight: 700; }
      .timeline { list-style: none; margin: 0; }
      .timeline li { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #f3f4f6; padding: 10px 0; }
      .timeline li:last-child { border-bottom: 0; }
      .timeline em { color: hsl(${hue} 64% 36%); font-style: normal; }
      @media (max-width: 520px) { .content, .metrics { grid-template-columns: 1fr; } .screen { padding: 18px; } }
    `,
  };
}

function buildReactCode(index) {
  const hue = (index * 37) % 360;
  const cards = Array.from({ length: 4 }, (_, item) => `
        <article className="rounded-md border border-slate-200 bg-white p-4">
          <span className="block text-slate-500">模块 ${item + 1}</span>
          <strong className="my-2 block text-2xl">${(index + 2) * (item + 3)}</strong>
          <small className="text-slate-500">流程节点 / 信息块</small>
        </article>`).join("\n");
  const rows = Array.from({ length: 6 }, (_, row) => `
          <li className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
            <span>高保真任务 ${row + 1}</span>
            <em className="not-italic text-slate-700">${row % 2 === 0 ? "进行中" : "待确认"}</em>
          </li>`).join("\n");
  return `export default function DemoPage({ title = "${pageName(index)}页面结构" }) {
  return (
    <main className="min-h-full bg-white p-7 text-slate-900" style={{ background: "linear-gradient(180deg, hsl(${hue} 52% 96%), #ffffff 42%)" }}>
      <nav className="mb-6 flex items-center justify-between text-sm text-slate-600">
        <strong className="text-slate-900">${pageName(index)}</strong>
        <span>React ${String(index + 1).padStart(2, "0")}</span>
      </nav>
      <section className="mb-5 rounded-md border border-slate-300 bg-white/90 p-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "hsl(${hue} 68% 38%)" }}>High Fidelity Baseline</p>
        <h1 className="mb-3 text-3xl font-bold leading-tight">{title}</h1>
        <p className="leading-7 text-slate-600">用于测试画布承载大量高保真页面 iframe 的运行时压力。</p>
      </section>
      <section className="mb-5 grid grid-cols-2 gap-3">
${cards}
      </section>
      <section className="grid grid-cols-[1.1fr_.9fr] gap-4">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-lg font-semibold">关键区域</h2>
          <p className="leading-7 text-slate-600">页面主体包含导航、摘要、卡片、列表和操作区。</p>
          <button className="mt-3 rounded-md px-4 py-2 font-semibold text-white" style={{ backgroundColor: "hsl(${hue} 64% 42%)" }}>主要操作</button>
        </div>
        <ul className="m-0 list-none rounded-md border border-slate-200 bg-white p-5">
${rows}
        </ul>
      </section>
    </main>
  );
}
`;
}

function createProject(kind) {
  const isPrototype = kind === "prototype";
  const project = runOw(["project", "create"], {
    name: isPrototype
      ? "性能基线-20个HTML/CSS原型页"
      : "性能基线-20个高保真React页",
    description: "用于创作端画布性能基线采样，可重复生成。",
  });
  const edit = runOw(["edit", "begin", project.id]);
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = `${kind}_perf_${String(index + 1).padStart(2, "0")}`;
    const base = {
      editId: edit.editId,
      pageId,
      routeKey: `${kind}-perf-${String(index + 1).padStart(2, "0")}`,
      name: pageName(index),
      runtimeType: isPrototype ? "prototype-html-css" : "high-fidelity-react",
      order: index,
      schema: buildSchema(index),
    };
    if (isPrototype) {
      const { html, css } = buildPrototype(index);
      runOw(["page", "create"], {
        ...base,
        prototypeHtml: html,
        prototypeCss: css,
        prototypeMeta: { width: 390, height: 844, generatedBy: "prototype-canvas-performance-fixture" },
      });
    } else {
      runOw(["page", "create"], {
        ...base,
        code: buildReactCode(index),
      });
    }
  }
  runOw(["edit", "validate", edit.editId]);
  runOw(["edit", "commit", edit.editId, "--note", `创建 ${pageCount} 页 ${kind} 性能基线项目`]);
  runOw(["project", "validate-runtime", project.id]);
  return project.id;
}

try {
  runOw(["doctor"]);
  const prototypeProjectId = createProject("prototype");
  const highFidelityProjectId = createProject("high");
  console.log(JSON.stringify({
    ok: true,
    pageCount,
    projects: {
      prototype: {
        projectId: prototypeProjectId,
        editUrl: `http://localhost:3200/demo/${prototypeProjectId}/edit`,
      },
      highFidelity: {
        projectId: highFidelityProjectId,
        editUrl: `http://localhost:3200/demo/${highFidelityProjectId}/edit`,
      },
    },
  }, null, 2));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
