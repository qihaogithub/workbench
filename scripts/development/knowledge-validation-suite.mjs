#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_PROJECT_ID = "proj_1782547891917_g0e1l9";
const DEFAULT_MODEL = "mydeepseek/deepseek-v4-flash";
const TMP_DIR = path.join(".tmp", "knowledge-validation-suite");
const REPORT_DIR = path.join(TMP_DIR, "reports");
const CLI = path.join("node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const CLI_ENTRY = path.join("packages", "project-cli", "src", "index.ts");

const REQUIRED_FACTS = [
  "KB-ORION-7421",
  "星桥知识库挑战",
  "青石计划",
  "23:30",
  "20 星币",
  "72",
  "EXPIRED_ADDRESS_MISSING",
  "MANUAL_REISSUE_REQUIRED",
  "SUP-KB-17",
  "RISK_DEVICE_ROTATION",
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const inlineMatch = /^--([^=]+)=(.*)$/.exec(token);
    if (inlineMatch) {
      args[inlineMatch[1]] = inlineMatch[2];
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        (result.stdout ?? "").trim(),
        (result.stderr ?? "").trim(),
      ].filter(Boolean).join("\n"),
    );
  }
  return (result.stdout ?? "").trim();
}

function runCli(args) {
  const output = runCommand(CLI, [CLI_ENTRY, ...args, "--json"]);
  return JSON.parse(output);
}

function tempFile(name, content) {
  ensureDir(TMP_DIR);
  const file = path.join(TMP_DIR, name);
  fs.writeFileSync(file, content, "utf-8");
  return file;
}

function circularPageCode() {
  return `import React from 'react';

interface DemoProps {
  orbitTitle: string;
  centerCode: string;
  ringLabel: string;
}

export default function Demo({
  orbitTitle = '知识库圆形雷达',
  centerCode = 'KB-ORION-7421',
  ringLabel = '文档事实校准',
}: DemoProps) {
  return (
    <main className="flex h-full w-full items-center justify-center bg-[#f7faf8] p-4">
      <section className="relative flex h-[288px] w-[288px] flex-col items-center justify-center overflow-hidden rounded-full border border-emerald-900/20 bg-white text-center shadow-sm">
        <div className="absolute inset-5 rounded-full border border-dashed border-emerald-700/30" />
        <div className="absolute inset-12 rounded-full bg-emerald-50" />
        <div className="relative z-10 flex h-32 w-32 flex-col items-center justify-center rounded-full bg-emerald-900 px-5 text-white shadow">
          <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-100">{ringLabel}</span>
          <strong className="mt-2 text-lg leading-tight">{centerCode}</strong>
        </div>
        <h1 className="relative z-10 mt-5 max-w-[210px] text-lg font-semibold text-slate-950">{orbitTitle}</h1>
        <p className="relative z-10 mt-1 max-w-[220px] text-xs leading-5 text-slate-600">
          页面用于验证非矩形预览、画布布局和知识库文档节点能否共同进入模板快照。
        </p>
      </section>
    </main>
  );
}
`;
}

function circularPageSchema() {
  return JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "圆形知识雷达页配置",
    type: "object",
    properties: {
      orbitTitle: { type: "string", title: "圆形页标题", default: "知识库圆形雷达" },
      centerCode: { type: "string", title: "中心代号", default: "KB-ORION-7421" },
      ringLabel: { type: "string", title: "环形标签", default: "文档事实校准" },
    },
    required: ["orbitTitle", "centerCode"],
    $demo: {
      previewSize: { width: 320, height: 320 },
    },
  }, null, 2);
}

function getPreviewSize(workspacePath, pageId) {
  const schemaPath = path.join(workspacePath, "demos", pageId, "config.schema.json");
  try {
    const schema = readJson(schemaPath);
    const preview = schema?.$demo?.previewSize ?? {};
    return {
      width: Number(preview.width) > 0 ? Number(preview.width) : 375,
      height: Number(preview.height) > 0 ? Number(preview.height) : 812,
    };
  } catch {
    return { width: 375, height: 812 };
  }
}

function listKnowledgeDocuments(workspacePath) {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  const manifestPath = path.join(knowledgeDir, "manifest.json");
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : { items: [] };
  return (manifest.items ?? [])
    .map((item) => {
      const relative = typeof item.path === "string" ? item.path : item.fileName;
      if (typeof relative !== "string" || !relative.endsWith(".md")) return null;
      const fileName = relative.replace(/^knowledge[\\/]/, "");
      const filePath = path.join(knowledgeDir, fileName);
      if (!fs.existsSync(filePath)) return null;
      return {
        id: String(item.id ?? path.basename(fileName, ".md")),
        title: String(item.title ?? path.basename(fileName, ".md")),
        fileName,
        description: typeof item.description === "string" ? item.description : `知识库文档：${fileName}`,
        markdown: fs.readFileSync(filePath, "utf-8"),
      };
    })
    .filter(Boolean);
}

function writeCanvasFixture(projectId, workspacePath) {
  const tree = readJson(path.join(workspacePath, "workspace-tree.json"));
  const pages = [...(tree.pages ?? [])].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const pageLayouts = {};
  let x = 0;
  for (const [index, page] of pages.entries()) {
    const size = getPreviewSize(workspacePath, page.id);
    pageLayouts[page.id] = {
      x,
      y: page.name === "圆形知识雷达页" ? 40 : 0,
      width: size.width,
      height: size.height,
      zIndex: index,
    };
    x += size.width + 48;
  }

  const docs = listKnowledgeDocuments(workspacePath);
  const nodes = {};
  docs.forEach((doc, index) => {
    const nodeId = `doc-${doc.id.replace(/[^a-zA-Z0-9_-]/g, "-") || index}`;
    nodes[nodeId] = {
      id: nodeId,
      kind: "document",
      title: doc.title,
      knowledgeDocument: {
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        description: doc.description,
      },
      markdown: doc.markdown,
      collapsed: false,
      expandedHeight: 360,
      layout: {
        x: index * 448,
        y: 900,
        width: 400,
        height: 360,
        zIndex: 20 + index,
      },
      createdAt: 1782553600000 + index,
      updatedAt: Date.now(),
    };
  });

  writeJson(path.join(workspacePath, ".canvas-layout.json"), {
    version: 1,
    projectId,
    updatedAt: Date.now(),
    state: {
      viewport: { x: 48, y: 48, zoom: 0.5 },
      pages: pageLayouts,
      nodes,
      hiddenKnowledgeDocumentIds: [],
    },
  });
}

function applyFixture(projectId, note) {
  const begin = runCli(["edit", "begin", projectId]);
  if (!begin.ok) throw new Error(JSON.stringify(begin));
  const { editId, workspacePath } = begin.data;
  let committed = false;
  try {
    const pages = runCli(["page", "list", editId]);
    const existing = pages.data.pages.find((page) => page.name === "圆形知识雷达页");
    const codePath = tempFile("circular-page.tsx", circularPageCode());
    const schemaPath = tempFile("circular-page.schema.json", circularPageSchema());

    if (existing) {
      runCli(["page", "update-code", editId, existing.id, "--code", `@${codePath}`]);
      runCli(["page", "update-schema", editId, existing.id, "--schema", `@${schemaPath}`]);
    } else {
      runCli([
        "page",
        "create",
        "--editId",
        editId,
        "--name",
        "圆形知识雷达页",
        "--code",
        `@${codePath}`,
        "--schema",
        `@${schemaPath}`,
      ]);
    }

    writeCanvasFixture(projectId, workspacePath);
    const validation = runCli(["edit", "validate", editId]);
    const diff = runCli(["edit", "diff", editId]);
    if (!validation.ok || validation.validation?.ok === false || validation.data?.ok === false) {
      throw new Error(`Validation failed: ${JSON.stringify(validation, null, 2)}`);
    }
    const commit = runCli(["edit", "commit", editId, note]);
    committed = true;
    return { editId, validation, diff, commit };
  } finally {
    if (!committed) {
      try {
        runCli(["edit", "discard", editId]);
      } catch {
        // best effort cleanup
      }
    }
  }
}

function createTemplate(projectId, nameSuffix = "") {
  runCli(["publish", "check", projectId]);
  const created = runCli([
    "template",
    "create-from-project",
    projectId,
    "--category",
    "知识库验证",
    "--name",
    `知识库索引验证模板-画布文档版${nameSuffix}`,
    "--description",
    "包含圆形页面、画布文档节点和知识库文档的验证模板",
  ]);
  const templateId = created.data?.template?.id ?? created.data?.id;
  if (!templateId) throw new Error(`Template id missing: ${JSON.stringify(created, null, 2)}`);
  const health = runCli(["template", "health-check", templateId]);
  return { created, health, templateId };
}

function instantiateTemplate(templateId) {
  const created = runCli([
    "template",
    "instantiate",
    templateId,
    `知识库AI跨项目指标验证-${Date.now()}`,
  ]);
  const projectId = created.data?.id ?? created.data?.project?.id;
  if (!projectId) throw new Error(`Project id missing: ${JSON.stringify(created, null, 2)}`);
  return { created, projectId };
}

function collectStaticMetrics({ projectId, templateId, instantiatedProjectId }) {
  const projectWorkspace = path.join("data", "projects", projectId, "workspace");
  const templateMapPath = templateId
    ? path.join("data", "knowledge", "templates", templateId, "reading-map.json")
    : null;
  const instantiatedWorkspace = instantiatedProjectId
    ? path.join("data", "projects", instantiatedProjectId, "workspace")
    : null;

  const canvas = readJson(path.join(projectWorkspace, ".canvas-layout.json"));
  const docs = listKnowledgeDocuments(projectWorkspace);
  const tree = readJson(path.join(projectWorkspace, "workspace-tree.json"));
  const circularPage = (tree.pages ?? []).find((page) => page.name === "圆形知识雷达页");
  const circularSize = circularPage ? getPreviewSize(projectWorkspace, circularPage.id) : null;
  const readingMap = templateMapPath && fs.existsSync(templateMapPath) ? readJson(templateMapPath) : null;
  const instantiatedCanvas = instantiatedWorkspace && fs.existsSync(path.join(instantiatedWorkspace, ".canvas-layout.json"))
    ? readJson(path.join(instantiatedWorkspace, ".canvas-layout.json"))
    : null;

  return {
    projectId,
    templateId,
    instantiatedProjectId,
    static: {
      pageCount: (tree.pages ?? []).length,
      circularPagePresent: Boolean(circularPage),
      circularPreviewIsSquare: circularSize ? circularSize.width === circularSize.height : false,
      knowledgeDocumentCount: docs.length,
      canvasDocumentNodeCount: Object.values(canvas.state.nodes ?? {}).filter((node) => node.kind === "document").length,
      canvasPageLayoutCount: Object.keys(canvas.state.pages ?? {}).length,
      templateReadingMap: readingMap
        ? {
          pageCount: readingMap.overview?.pageCount ?? 0,
          configCount: readingMap.overview?.configCount ?? 0,
          knowledgeCount: readingMap.overview?.knowledgeCount ?? 0,
          sourcePaths: (readingMap.structure?.knowledgeDocuments ?? []).map((doc) => doc.path),
        }
        : null,
      instantiatedCanvasDocumentNodeCount: instantiatedCanvas
        ? Object.values(instantiatedCanvas.state.nodes ?? {}).filter((node) => node.kind === "document").length
        : null,
    },
  };
}

function scoreAnswer(text, expectedFacts = REQUIRED_FACTS, expectSources = true) {
  const matchedFacts = expectedFacts.filter((fact) => text.includes(fact));
  const citedSources = [
    "玩法规则.md",
    "FAQ与客服口径.md",
    "中奖履约SOP.md",
    "风控与异常处理.md",
  ].filter((source) => text.includes(source));
  const shareIncreaseConflict = /分享[^。\n]{0,12}(增加|加)[^。\n]{0,12}抽奖/.test(text)
    && !/(不增加抽奖|不会增加抽奖|并不会增加抽奖|分享不加抽奖|分享只给星币不给次数)/.test(text);
  return {
    matchedFacts,
    expectedFacts,
    factRecall: expectedFacts.length === 0 ? 1 : matchedFacts.length / expectedFacts.length,
    citedSources,
    sourceCitationRate: expectSources ? citedSources.length / 4 : null,
    hallucinationFlags: [
      text.includes("无法确定") && matchedFacts.length < 3 ? "low_confidence_without_lookup" : null,
      text.includes("24 小时") ? "wrong_address_deadline_candidate" : null,
      shareIncreaseConflict ? "share_draw_conflict_candidate" : null,
    ].filter(Boolean),
  };
}

async function askAgent({ projectId, agentUrl, model, prompt, sessionId, expectedFacts, expectSources }) {
  const workspace = path.resolve(path.join("data", "projects", projectId, "workspace"));
  const response = await fetch(`${agentUrl.replace(/\/+$/, "")}/api/agent/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: prompt,
      demoId: projectId,
      workingDir: workspace,
      customWorkspace: true,
      model,
      options: { stream: false, timeout: 120000 },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`Agent request failed: ${JSON.stringify(body)}`);
  }
  const text = typeof body.data === "string"
    ? body.data
    : body.data?.content ?? body.data?.message ?? JSON.stringify(body.data);
  return { sessionId, text, score: scoreAnswer(text, expectedFacts, expectSources) };
}

async function runAiMetrics({ projectId, agentUrl, model }) {
  const prompts = [
    {
      name: "explicit-knowledge-report",
      prompt: "请查阅当前项目知识库后回答：活动代号、任务换抽奖资格规则、分享奖励、地址填写时限、超时状态、客服升级码、风控状态分别是什么？请列出来源文档。",
      expectedFacts: [
        "KB-ORION-7421",
        "星桥知识库挑战",
        "23:30",
        "20 星币",
        "72",
        "EXPIRED_ADDRESS_MISSING",
        "SUP-KB-17",
        "RISK_DEVICE_ROTATION",
      ],
      expectSources: true,
    },
    {
      name: "implicit-support-answer",
      prompt: "用户说分享后为什么没有增加抽奖次数，又担心中奖后忘记填地址。请直接给客服口径，并说明需要升级客服的条件。",
      expectedFacts: [
        "23:30",
        "20 星币",
        "72",
        "EXPIRED_ADDRESS_MISSING",
        "MANUAL_REISSUE_REQUIRED",
        "SUP-KB-17",
      ],
      expectSources: false,
    },
  ];
  const results = [];
  for (const item of prompts) {
    results.push(await askAgent({
      projectId,
      agentUrl,
      model,
      prompt: item.prompt,
      sessionId: `kb-metrics-${item.name}-${Date.now()}`,
      expectedFacts: item.expectedFacts,
      expectSources: item.expectSources,
    }));
  }
  const sourceRated = results.filter((item) => item.score.sourceCitationRate !== null);
  return {
    model,
    agentUrl,
    prompts: results,
    averageFactRecall: results.reduce((sum, item) => sum + item.score.factRecall, 0) / results.length,
    averageSourceCitationRate: sourceRated.length === 0
      ? null
      : sourceRated.reduce((sum, item) => sum + item.score.sourceCitationRate, 0) / sourceRated.length,
    hallucinationFlagCount: results.reduce((sum, item) => sum + item.score.hallucinationFlags.length, 0),
  };
}

function assertMetricThresholds(report) {
  const failures = [];
  const staticMetrics = report.static;
  if (staticMetrics.pageCount < 4) failures.push("pageCount < 4");
  if (!staticMetrics.circularPagePresent) failures.push("circular page missing");
  if (!staticMetrics.circularPreviewIsSquare) failures.push("circular page preview is not square");
  if (staticMetrics.knowledgeDocumentCount < 4) failures.push("knowledgeDocumentCount < 4");
  if (staticMetrics.canvasDocumentNodeCount < 4) failures.push("canvasDocumentNodeCount < 4");
  if (staticMetrics.templateReadingMap && staticMetrics.templateReadingMap.knowledgeCount < 4) {
    failures.push("template knowledgeCount < 4");
  }
  if (report.ai) {
    if (report.ai.averageFactRecall < 0.8) failures.push("averageFactRecall < 0.8");
    if (report.ai.averageSourceCitationRate < 0.5) failures.push("averageSourceCitationRate < 0.5");
    if (report.ai.hallucinationFlagCount > 0) failures.push("hallucination flags present");
  }
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "run";
  const projectId = args["project-id"] || DEFAULT_PROJECT_ID;
  const model = args.model || DEFAULT_MODEL;
  ensureDir(REPORT_DIR);

  let templateId = args["template-id"] || null;
  let instantiatedProjectId = args["instantiated-project-id"] || null;
  const report = {
    startedAt: new Date().toISOString(),
    command,
    projectId,
    templateId,
    instantiatedProjectId,
  };

  if (command === "fixture" || command === "run") {
    report.fixture = applyFixture(projectId, "补充知识库验证圆形页面与画布文档节点");
  }

  if (command === "template" || command === "run") {
    const template = createTemplate(projectId, args["name-suffix"] || `-${Date.now()}`);
    templateId = template.templateId;
    report.template = template;
    report.templateId = templateId;
  }

  if ((command === "instantiate" || command === "run") && templateId) {
    const instantiated = instantiateTemplate(templateId);
    instantiatedProjectId = instantiated.projectId;
    report.instantiated = instantiated;
    report.instantiatedProjectId = instantiatedProjectId;
  }

  if (["metrics", "ai", "run", "fixture", "template", "instantiate"].includes(command)) {
    Object.assign(report, collectStaticMetrics({ projectId, templateId, instantiatedProjectId }));
  }

  if ((command === "ai" || command === "run") && args["agent-url"]) {
    report.ai = await runAiMetrics({
      projectId: instantiatedProjectId || projectId,
      agentUrl: args["agent-url"],
      model,
    });
  } else if (command === "ai") {
    throw new Error("--agent-url is required for ai command");
  }

  report.finishedAt = new Date().toISOString();
  report.failures = assertMetricThresholds(report);
  report.ok = report.failures.length === 0;

  const reportPath = path.join(REPORT_DIR, `knowledge-validation-${Date.now()}.json`);
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ok: report.ok, reportPath, failures: report.failures, report }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
