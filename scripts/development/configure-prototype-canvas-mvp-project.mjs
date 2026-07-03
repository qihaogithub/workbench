#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const owBin = path.join(repoRoot, "packages/project-cli/bin/ow.mjs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prototype-canvas-config-"));
const projectId = process.argv[2] ?? "proj_1782980494805_klfp75";

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
  return payload;
}

function schema(title, properties) {
  return JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $demo: {
      previewSize: { width: 390, height: 844 },
    },
    title,
    type: "object",
    properties,
    required: [],
  }, null, 2);
}

const prototypeSchemaA = schema("01 可配置原型页", {
  heroTitle: { type: "string", title: "主标题", default: "可配置原型首页" },
  heroSubtitle: { type: "string", title: "副标题", default: "修改右侧配置后，Shadow DOM 原型页会直接刷新绑定内容。" },
  themeColor: { type: "string", title: "主题色", format: "color", default: "#2563EB" },
  actionLabel: { type: "string", title: "按钮文案", default: "开始验证" },
});

const prototypeHtmlA = `
<main class="config-prototype">
  <header class="appbar">
    <strong data-bind-text="heroTitle">可配置原型首页</strong>
    <span>Prototype Config</span>
  </header>
  <section class="hero" data-bind-style-background-color="themeColor">
    <p class="eyebrow">HTML/CSS prototype</p>
    <h1 data-bind-text="heroTitle">可配置原型首页</h1>
    <p data-bind-text="heroSubtitle">修改右侧配置后，Shadow DOM 原型页会直接刷新绑定内容。</p>
    <button data-bind-text="actionLabel">开始验证</button>
  </section>
  <section class="metric-grid">
    <article><span>页面数量</span><strong>30</strong><small>prototype pages</small></article>
    <article><span>高保真对照</span><strong>2</strong><small>React pages</small></article>
    <article><span>绑定字段</span><strong>4</strong><small>config schema</small></article>
    <article><span>运行时</span><strong>0</strong><small>iframe budget</small></article>
  </section>
  <section class="dense-panel">
    <div class="panel-title">
      <h2>可编辑属性区域</h2>
      <span data-bind-style-color="themeColor">点击任意文本或卡片试试</span>
    </div>
    <ul>
      <li><b>文本属性</b><span>可直接写回 prototype.html</span></li>
      <li><b>样式属性</b><span>颜色、边框、圆角、字号等可即时保存</span></li>
      <li><b>配置项</b><span>{{heroTitle}} / {{actionLabel}}</span></li>
    </ul>
  </section>
</main>
`;

const prototypeCssA = `
.config-prototype { min-height: 100%; padding: 18px; background: #f8fafc; color: #111827; }
.appbar { display: flex; justify-content: space-between; align-items: center; border: 1px solid #d8dee8; background: #fff; padding: 12px 14px; margin-bottom: 14px; }
.appbar strong { font-size: 16px; }
.appbar span, .eyebrow, small { color: #64748b; font-size: 11px; }
.hero { color: #fff; padding: 22px; margin-bottom: 14px; box-shadow: 0 18px 40px rgba(15, 23, 42, .16); }
.hero h1 { margin: 8px 0; font-size: 31px; line-height: 1.08; }
.hero p { margin: 0 0 14px; line-height: 1.55; }
.hero button { border: 0; background: #fff; color: #111827; min-height: 38px; padding: 0 14px; font-weight: 900; }
.metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.metric-grid article, .dense-panel { border: 1px solid #d8dee8; background: #fff; padding: 13px; }
.metric-grid strong { display: block; margin: 6px 0; font-size: 24px; }
.panel-title { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.panel-title h2 { margin: 0; font-size: 16px; }
ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
li { display: grid; grid-template-columns: 88px 1fr; gap: 10px; border-top: 1px solid #edf2f7; padding-top: 8px; font-size: 12px; }
`;

const prototypeSchemaB = schema("02 图片与颜色配置原型页", {
  screenTitle: { type: "string", title: "页面标题", default: "图片与颜色配置" },
  bannerImage: { type: "string", title: "横幅图片", format: "image", default: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&auto=format&fit=crop" },
  accentColor: { type: "string", title: "强调色", format: "color", default: "#0F766E" },
  linkLabel: { type: "string", title: "链接文案", default: "查看配置绑定" },
});

const prototypeHtmlB = `
<main class="media-prototype">
  <section class="media-card">
    <img data-bind-src="bannerImage" src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&auto=format&fit=crop" alt="原型页横幅" />
    <div class="content">
      <p data-bind-style-color="accentColor">Prototype asset binding</p>
      <h1 data-bind-text="screenTitle">图片与颜色配置</h1>
      <a href="#config" data-bind-text="linkLabel" data-bind-style-color="accentColor">查看配置绑定</a>
    </div>
  </section>
  <section class="table">
    <div><b>图片</b><span>通过 data-bind-src 切换</span></div>
    <div><b>颜色</b><span>通过 data-bind-style-color 切换</span></div>
    <div><b>文案</b><span>通过 data-bind-text 切换</span></div>
    <div><b>属性</b><span>单页预览可点击元素直接编辑</span></div>
  </section>
</main>
`;

const prototypeCssB = `
.media-prototype { min-height: 100%; padding: 18px; background: #eef2f7; color: #111827; }
.media-card { overflow: hidden; border: 1px solid #d8dee8; background: #fff; box-shadow: 0 18px 38px rgba(15,23,42,.12); }
img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.content { padding: 18px; }
.content p { margin: 0 0 8px; font-size: 11px; font-weight: 900; text-transform: uppercase; }
h1 { margin: 0 0 12px; font-size: 30px; line-height: 1.08; }
a { display: inline-flex; min-height: 36px; align-items: center; border: 1px solid currentColor; padding: 0 12px; font-weight: 900; text-decoration: none; }
.table { display: grid; gap: 8px; margin-top: 14px; }
.table div { display: grid; grid-template-columns: 72px 1fr; gap: 10px; border: 1px solid #d8dee8; background: #fff; padding: 12px; font-size: 12px; }
.table span { color: #64748b; }
`;

function reactCode(componentName, title, accent, pale) {
  return `interface DemoProps {
  headline?: string;
  themeColor?: string;
  ctaLabel?: string;
}

export default function ${componentName}({
  headline = ${JSON.stringify(title)},
  themeColor = ${JSON.stringify(accent)},
  ctaLabel = "高保真配置按钮",
}: DemoProps) {
  const rows = ["组件树", "配置 Props", "iframe runtime", "视觉属性"];
  return (
    <main style={{ minHeight: "100%", padding: 24, background: ${JSON.stringify(pale)}, color: "#111827" }}>
      <section style={{ border: "1px solid #d8dee8", background: "#fff", padding: 20, boxShadow: "0 18px 36px rgba(15,23,42,.12)" }}>
        <p style={{ margin: "0 0 8px", color: themeColor, fontSize: 12, fontWeight: 900 }}>HIGH FIDELITY REACT</p>
        <h1 style={{ margin: "0 0 12px", fontSize: 30, lineHeight: 1.08 }}>{headline}</h1>
        <button style={{ border: 0, minHeight: 40, padding: "0 14px", background: themeColor, color: "#fff", fontWeight: 900 }}>{ctaLabel}</button>
      </section>
      <section style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {rows.map((row, index) => (
          <article key={row} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, border: "1px solid #d8dee8", background: "#fff", padding: 12 }}>
            <b style={{ color: themeColor }}>{String(index + 1).padStart(2, "0")}</b>
            <span>{row}</span>
          </article>
        ))}
      </section>
    </main>
  );
}
`;
}

function reactSchema(title, headline, color) {
  return schema(title, {
    headline: { type: "string", title: "主标题", default: headline },
    themeColor: { type: "string", title: "主题色", format: "color", default: color },
    ctaLabel: { type: "string", title: "按钮文案", default: "高保真配置按钮" },
  });
}

try {
  runOw(["doctor"]);
  runOw(["project", "get", projectId]);
  const edit = runOw(["edit", "begin", projectId]).data;
  const editId = edit.editId;
  runOw(["page", "list", editId]);
  runOw(["page", "get", editId, "prototype_mvp_01"]);
  runOw(["page", "get", editId, "high_fidelity_compare_01"]);
  runOw(["config", "get-project-schema", editId]);

  runOw(["page", "update-prototype"], {
    editId,
    pageId: "prototype_mvp_01",
    prototypeHtml: prototypeHtmlA,
    prototypeCss: prototypeCssA,
    prototypeMeta: { width: 390, height: 844, density: "configurable", generatedBy: "prototype-canvas-config-seed" },
  });
  runOw(["page", "update-schema"], {
    editId,
    pageId: "prototype_mvp_01",
    schema: prototypeSchemaA,
  });

  runOw(["page", "update-prototype"], {
    editId,
    pageId: "prototype_mvp_02",
    prototypeHtml: prototypeHtmlB,
    prototypeCss: prototypeCssB,
    prototypeMeta: { width: 390, height: 844, density: "configurable", generatedBy: "prototype-canvas-config-seed" },
  });
  runOw(["page", "update-schema"], {
    editId,
    pageId: "prototype_mvp_02",
    schema: prototypeSchemaB,
  });

  runOw(["page", "update-code"], {
    editId,
    pageId: "high_fidelity_compare_01",
    code: reactCode("HighFidelityCompareA", "高保真对照 A：配置可编辑", "#2563EB", "#DBEAFE"),
  });
  runOw(["page", "update-schema"], {
    editId,
    pageId: "high_fidelity_compare_01",
    schema: reactSchema("31 高保真对照 A 配置", "高保真对照 A：配置可编辑", "#2563EB"),
  });

  runOw(["page", "update-code"], {
    editId,
    pageId: "high_fidelity_compare_02",
    code: reactCode("HighFidelityCompareB", "高保真对照 B：属性对比", "#7C3AED", "#EDE9FE"),
  });
  runOw(["page", "update-schema"], {
    editId,
    pageId: "high_fidelity_compare_02",
    schema: reactSchema("32 高保真对照 B 配置", "高保真对照 B：属性对比", "#7C3AED"),
  });

  runOw(["config", "validate-page-schema", editId, "prototype_mvp_01"]);
  runOw(["config", "validate-page-schema", editId, "prototype_mvp_02"]);
  const validation = runOw(["edit", "validate", editId]).data;
  const diff = runOw(["edit", "diff", editId]).data;
  const commit = runOw([
    "edit",
    "commit",
    editId,
    "--note",
    "为原型页和高保真页补充属性编辑与配置项验证内容",
  ]).data;
  const runtime = runOw(["project", "validate-runtime", projectId]).data;

  console.log(JSON.stringify({
    ok: true,
    projectId,
    editId,
    validation,
    diff,
    commitVersion: commit.version?.versionId,
    runtime,
    editUrl: `http://localhost:3200/demo/${projectId}/edit`,
    configuredPages: [
      "prototype_mvp_01",
      "prototype_mvp_02",
      "high_fidelity_compare_01",
      "high_fidelity_compare_02",
    ],
  }, null, 2));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
