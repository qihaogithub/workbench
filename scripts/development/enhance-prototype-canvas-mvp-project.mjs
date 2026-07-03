#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const owBin = path.join(repoRoot, "packages/project-cli/bin/ow.mjs");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prototype-canvas-enhance-"));
const projectId = process.argv[2] ?? "proj_1782980494805_klfp75";
const existingEditId = process.env.EDIT_ID;

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

function previewSchema(title, width = 390, height = 844) {
  return JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $demo: {
      previewSize: { width, height },
    },
    title,
    type: "object",
    properties: {},
  }, null, 2);
}

const scenarios = [
  ["复杂首页", "用户增长、运营指标、内容推荐与任务入口汇总"],
  ["交易工作台", "订单、支付、售后、履约状态的高密度业务界面"],
  ["数据驾驶舱", "指标瀑布、趋势图、排行榜与异常预警"],
  ["CRM 客户页", "客户画像、跟进记录、商机阶段和联系人网络"],
  ["审批中心", "流程节点、批注、附件、风险项和下一步动作"],
  ["学习任务", "课程结构、练习状态、积分、老师反馈和家长提醒"],
  ["活动运营", "预算、投放、转化漏斗、物料排期和奖品库存"],
  ["资源管理", "分类树、检索结果、权限状态和批量操作"],
  ["消息协同", "收件箱、讨论线程、待办、日程和通知策略"],
  ["门店巡检", "地图摘要、检查清单、问题照片和整改进度"],
];

function makeItems(index, count, prefix) {
  return Array.from({ length: count }, (_, item) => {
    const score = 61 + ((index * 11 + item * 7) % 36);
    const status = ["正常", "关注", "延迟", "待复核"][item % 4];
    return `
      <li class="dense-row">
        <span class="row-index">${String(item + 1).padStart(2, "0")}</span>
        <div>
          <strong>${prefix} ${item + 1}</strong>
          <small>跨端流程节点 ${index + 1}-${item + 1} / ${status}</small>
        </div>
        <em>${score}%</em>
      </li>
    `;
  }).join("");
}

function makeCards(index, count) {
  return Array.from({ length: count }, (_, item) => {
    const value = ((index + 5) * (item + 9) * 13) % 997;
    return `
      <article class="micro-card">
        <span>模块 ${item + 1}</span>
        <strong>${value}</strong>
        <small>${item % 3 === 0 ? "本周新增" : item % 3 === 1 ? "待处理" : "已完成"}</small>
      </article>
    `;
  }).join("");
}

function makeBars(index, count) {
  return Array.from({ length: count }, (_, item) => {
    const width = 22 + ((index * 17 + item * 13) % 72);
    return `
      <div class="bar-row">
        <span>渠道 ${item + 1}</span>
        <i><b style="width: ${width}%"></b></i>
        <em>${width}%</em>
      </div>
    `;
  }).join("");
}

function makeTimeline(index, count) {
  return Array.from({ length: count }, (_, item) => `
    <li>
      <b>${String(8 + item).padStart(2, "0")}:30</b>
      <span>${["需求确认", "视觉走查", "研发联调", "灰度发布", "数据复盘"][item % 5]}</span>
      <em>${["Owner", "Design", "FE", "QA"][item % 4]}-${index + item + 1}</em>
    </li>
  `).join("");
}

function makePrototype(index) {
  const [title, subtitle] = scenarios[index % scenarios.length];
  const serial = String(index + 1).padStart(2, "0");
  const hue = (index * 29 + 12) % 360;
  const accent = `hsl(${hue} 68% 42%)`;
  const soft = `hsl(${hue} 72% 96%)`;
  const html = `
    <main class="stress-screen">
      <header class="app-bar">
        <div>
          <small>Prototype Limit Canvas / ${serial}</small>
          <strong>${serial} ${title}</strong>
        </div>
        <span class="pill">HTML/CSS</span>
      </header>

      <section class="hero-panel">
        <div>
          <p class="eyebrow">High density prototype</p>
          <h1>${title}</h1>
          <p>${subtitle}。此页面故意增加信息密度、嵌套层级、图表与长列表，用于观察画布缩放、拖拽、选择和多页面渲染上限。</p>
        </div>
        <aside>
          <span>完成度</span>
          <strong>${72 + (index % 18)}%</strong>
          <small>触点 ${18 + index} / 风险 ${index % 5}</small>
        </aside>
      </section>

      <section class="metric-grid">${makeCards(index, 12)}</section>

      <section class="workbench">
        <article class="panel wide">
          <div class="panel-title">
            <h2>趋势与容量</h2>
            <span>近 12 周</span>
          </div>
          <div class="bars">${makeBars(index, 10)}</div>
        </article>
        <article class="panel">
          <div class="panel-title">
            <h2>今日排期</h2>
            <span>${6 + (index % 8)} 项</span>
          </div>
          <ol class="timeline">${makeTimeline(index, 9)}</ol>
        </article>
      </section>

      <section class="matrix">
        <article class="panel">
          <div class="panel-title">
            <h2>对象列表</h2>
            <span>24 rows</span>
          </div>
          <ul class="dense-list">${makeItems(index, 24, title)}</ul>
        </article>
        <article class="panel side-panel">
          <div class="panel-title">
            <h2>策略栈</h2>
            <span>8 layers</span>
          </div>
          <div class="layer-stack">
            ${Array.from({ length: 8 }, (_, item) => `
              <div class="layer">
                <strong>${["权限", "状态", "校验", "库存", "转化", "排期", "触达", "复盘"][item]}</strong>
                <span>${30 + ((index + item) * 9) % 61}%</span>
              </div>
            `).join("")}
          </div>
          <div class="note-block">
            <strong>走查备注</strong>
            <p>页面包含多块滚动内容、密集文本、网格、条形图和操作按钮。所有内容为静态 DOM，不占用 iframe 预算。</p>
          </div>
        </article>
      </section>

      <footer class="bottom-actions">
        <button>主动作</button>
        <button class="secondary">次动作</button>
        <button class="ghost">更多</button>
      </footer>
    </main>
  `;
  const css = `
    :host { display: block; min-height: 100%; background: #f5f7fb; }
    * { box-sizing: border-box; }
    .stress-screen {
      min-height: 100%;
      padding: 18px;
      color: #111827;
      background:
        linear-gradient(180deg, ${soft}, #f9fafb 38%, #eef2f7 100%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .app-bar, .hero-panel, .panel, .micro-card, .bottom-actions {
      border: 1px solid #d8dee8;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }
    .app-bar {
      position: sticky;
      top: 0;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      margin-bottom: 14px;
      backdrop-filter: blur(10px);
    }
    .app-bar small, .panel-title span, .micro-card span, .micro-card small, .dense-row small {
      color: #64748b;
      font-size: 11px;
    }
    .app-bar strong { display: block; margin-top: 3px; font-size: 16px; }
    .pill {
      flex: none;
      border: 1px solid ${accent};
      color: ${accent};
      padding: 6px 9px;
      font-size: 11px;
      font-weight: 800;
      background: ${soft};
    }
    .hero-panel {
      display: grid;
      grid-template-columns: 1fr 104px;
      gap: 14px;
      padding: 18px;
      margin-bottom: 14px;
    }
    .eyebrow {
      margin: 0 0 6px;
      color: ${accent};
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }
    h1, h2, p { margin-top: 0; }
    h1 { margin-bottom: 8px; font-size: 27px; line-height: 1.08; letter-spacing: 0; }
    h2 { margin-bottom: 0; font-size: 15px; }
    p { margin-bottom: 0; color: #475569; line-height: 1.58; font-size: 13px; }
    .hero-panel aside {
      display: flex;
      flex-direction: column;
      justify-content: center;
      border-left: 1px solid #e5e7eb;
      padding-left: 14px;
    }
    .hero-panel aside span, .hero-panel aside small { color: #64748b; font-size: 11px; }
    .hero-panel aside strong { color: ${accent}; font-size: 28px; line-height: 1.1; }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .micro-card { min-height: 82px; padding: 11px; }
    .micro-card strong { display: block; margin: 7px 0 3px; font-size: 21px; }
    .workbench, .matrix {
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .panel { padding: 13px; overflow: hidden; }
    .panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .bar-row {
      display: grid;
      grid-template-columns: 54px 1fr 34px;
      align-items: center;
      gap: 8px;
      min-height: 25px;
      font-size: 11px;
    }
    .bar-row i {
      display: block;
      height: 8px;
      overflow: hidden;
      background: #e5e7eb;
    }
    .bar-row b { display: block; height: 100%; background: ${accent}; }
    .bar-row em, .timeline em, .dense-row em {
      color: ${accent};
      font-style: normal;
      font-weight: 800;
      font-size: 11px;
    }
    .timeline, .dense-list { list-style: none; margin: 0; padding: 0; }
    .timeline li {
      display: grid;
      grid-template-columns: 40px 1fr 48px;
      gap: 8px;
      padding: 7px 0;
      border-bottom: 1px solid #edf2f7;
      font-size: 11px;
    }
    .timeline li:last-child, .dense-row:last-child { border-bottom: 0; }
    .timeline b { color: #334155; }
    .dense-list {
      max-height: 432px;
      overflow: hidden;
      border: 1px solid #edf2f7;
    }
    .dense-row {
      display: grid;
      grid-template-columns: 28px 1fr 42px;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid #edf2f7;
      background: #fff;
    }
    .dense-row:nth-child(even) { background: #f8fafc; }
    .row-index {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      color: #fff;
      background: ${accent};
      font-size: 10px;
      font-weight: 900;
    }
    .dense-row strong { display: block; margin-bottom: 2px; font-size: 12px; }
    .side-panel { display: flex; flex-direction: column; gap: 12px; }
    .layer-stack { display: grid; gap: 7px; }
    .layer {
      display: flex;
      justify-content: space-between;
      border: 1px solid #e5e7eb;
      background: #f8fafc;
      padding: 9px 10px;
      font-size: 12px;
    }
    .layer span { color: ${accent}; font-weight: 900; }
    .note-block {
      border: 1px dashed #cbd5e1;
      background: ${soft};
      padding: 12px;
    }
    .note-block strong { display: block; margin-bottom: 6px; font-size: 13px; }
    .bottom-actions {
      display: grid;
      grid-template-columns: 1fr 1fr 86px;
      gap: 8px;
      padding: 10px;
    }
    button {
      min-height: 38px;
      border: 0;
      background: ${accent};
      color: #fff;
      font-weight: 900;
      font-size: 13px;
    }
    button.secondary {
      border: 1px solid ${accent};
      background: #fff;
      color: ${accent};
    }
    button.ghost {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
    }
    @media (max-width: 560px) {
      .stress-screen { padding: 14px; }
      .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .workbench, .matrix, .hero-panel { grid-template-columns: 1fr; }
      .hero-panel aside { border-left: 0; border-top: 1px solid #e5e7eb; padding: 12px 0 0; }
    }
  `;
  return { html, css };
}

function makeReactPage(componentName, title, accent, secondary) {
  const rows = Array.from({ length: 16 }, (_, index) => ({
    name: `${title} 事项 ${index + 1}`,
    status: ["已上线", "联调中", "待确认", "排期中"][index % 4],
    value: 58 + ((index * 11) % 39),
  }));
  return `const rows = ${JSON.stringify(rows, null, 2)};
const cards = [
  { label: "活跃模块", value: "42", note: "高保真 React" },
  { label: "状态节点", value: "128", note: "iframe 渲染" },
  { label: "资源占用", value: "Heavy", note: "对比原型页" },
  { label: "交互层级", value: "6", note: "组件树" }
];

export default function ${componentName}() {
  return (
    <main style={{
      minHeight: "100%",
      padding: 24,
      background: "linear-gradient(180deg, ${secondary}, #f8fafc 44%, #eef2f7 100%)",
      color: "#111827",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        border: "1px solid #d8dee8",
        background: "rgba(255,255,255,0.94)",
        padding: 16,
        marginBottom: 16,
        boxShadow: "0 12px 28px rgba(15,23,42,0.08)"
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>HIGH FIDELITY REACT</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 25, lineHeight: 1.08 }}>${title}</h1>
        </div>
        <div style={{ color: "${accent}", fontWeight: 900, border: "1px solid ${accent}", padding: "8px 10px" }}>React</div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
        {cards.map((card) => (
          <article key={card.label} style={{ border: "1px solid #e2e8f0", background: "#fff", padding: 16 }}>
            <div style={{ color: "#64748b", fontSize: 12 }}>{card.label}</div>
            <strong style={{ display: "block", margin: "8px 0", fontSize: 28 }}>{card.value}</strong>
            <small style={{ color: "#64748b" }}>{card.note}</small>
          </article>
        ))}
      </section>

      <section style={{ border: "1px solid #d8dee8", background: "#fff", padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>高保真组件列表</h2>
          <span style={{ color: "#64748b", fontSize: 12 }}>16 rows</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row, index) => (
            <div key={row.name} style={{
              display: "grid",
              gridTemplateColumns: "34px 1fr 64px",
              alignItems: "center",
              gap: 10,
              border: "1px solid #edf2f7",
              background: index % 2 === 0 ? "#f8fafc" : "#fff",
              padding: 10
            }}>
              <b style={{ color: "${accent}" }}>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <strong style={{ display: "block", fontSize: 13 }}>{row.name}</strong>
                <small style={{ color: "#64748b" }}>{row.status}</small>
              </div>
              <span style={{ color: "${accent}", fontWeight: 900 }}>{row.value}%</span>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button style={{ border: 0, minHeight: 42, background: "${accent}", color: "#fff", fontWeight: 900 }}>主操作</button>
        <button style={{ border: "1px solid ${accent}", minHeight: 42, background: "#fff", color: "${accent}", fontWeight: 900 }}>次操作</button>
      </footer>
    </main>
  );
}
`;
}

try {
  runOw(["doctor"]);
  const editId = existingEditId ?? runOw(["edit", "begin", projectId]).data.editId;

  for (let index = 0; index < 30; index += 1) {
    const pageId = `prototype_mvp_${String(index + 1).padStart(2, "0")}`;
    const { html, css } = makePrototype(index);
    runOw(["page", "update-prototype"], {
      editId,
      pageId,
      prototypeHtml: html,
      prototypeCss: css,
      prototypeMeta: {
        width: 390,
        height: 844,
        density: "stress",
        generatedBy: "prototype-canvas-enhance",
      },
    });
  }

  const highFidelityPages = [
    {
      pageId: "high_fidelity_compare_01",
      routeKey: "high-fidelity-compare-01",
      name: "31 高保真对照 A",
      order: 30,
      code: makeReactPage("HighFidelityCompareA", "高保真对照 A", "#2563eb", "#dbeafe"),
    },
    {
      pageId: "high_fidelity_compare_02",
      routeKey: "high-fidelity-compare-02",
      name: "32 高保真对照 B",
      order: 31,
      code: makeReactPage("HighFidelityCompareB", "高保真对照 B", "#7c3aed", "#ede9fe"),
    },
  ];

  for (const page of highFidelityPages) {
    runOw(["page", "create"], {
      editId,
      pageId: page.pageId,
      routeKey: page.routeKey,
      name: page.name,
      order: page.order,
      code: page.code,
      schema: previewSchema(`${page.name}配置`),
    });
  }

  const validation = runOw(["edit", "validate", editId]);
  const diff = runOw(["edit", "diff", editId]);
  const commit = runOw([
    "edit",
    "commit",
    editId,
    "--note",
    "增强原型页复杂度并新增高保真对照页",
  ]);
  const runtime = runOw(["project", "validate-runtime", projectId]);

  console.log(JSON.stringify({
    ok: true,
    projectId,
    editId,
    committed: true,
    validation: validation.data,
    diff: diff.data,
    commit: commit.data,
    runtime: runtime.data,
    editUrl: `http://localhost:3200/demo/${projectId}/edit`,
    prototypePageCount: 30,
    highFidelityPageIds: highFidelityPages.map((page) => page.pageId),
  }, null, 2));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
