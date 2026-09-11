#!/usr/bin/env node

/**
 * 测量创作端编辑页加载速度 —— ego-browser 自动化脚本
 *
 * 用法:
 *   pnpm measure:edit-page-load [projectId] [--json]
 *   或
 *   node scripts/development/measure-edit-page-load.mjs [projectId]
 *
 * 环境变量:
 *   E2E_BASE_URL  — 创作端地址（默认 http://localhost:4200；BASE_URL 为兼容别名）
 *   PROJECT_ID — 项目 ID（默认取 data/projects/ 下第一个）
 *   E2E_USER / E2E_PASSWORD — 登录凭据（密码无默认值；USERNAME/PASSWORD 为兼容别名）
 *   NO_LOGIN — 设为 1 跳过自动登录
 *
 * 输出:
 *   - 冷/热加载导航耗时与 Navigation Timing
 *   - 编辑器 ready marker 到达时间
 *   - 返回首页耗时与 Navigation Timing
 */

import { execSync } from "child_process";
import { readdirSync } from "fs";

import {
  getE2EBaseURL,
  getE2EPassword,
  getE2EUser,
} from "./e2e-config.mjs";

const BASE_URL = getE2EBaseURL("BASE_URL");
const USERNAME = getE2EUser("USERNAME");
const SKIP_LOGIN = process.env.NO_LOGIN === "1";
const JSON_OUTPUT = process.argv.includes("--json");

function getDefaultProject() {
  try {
    const dirs = readdirSync("data/projects");
    return dirs[0] || "";
  } catch {
    return "";
  }
}

const projectId =
  process.argv.slice(2).find((argument) => !argument.startsWith("-")) ||
  process.env.PROJECT_ID ||
  getDefaultProject();

if (!projectId) {
  console.error("❌ 未找到项目，请指定 projectId");
  console.error("   用法: node scripts/development/measure-edit-page-load.mjs <projectId>");
  process.exit(1);
}

const EDIT_URL = `${BASE_URL}/demo/${projectId}/edit`;
const HOME_URL = `${BASE_URL}/`;

// 将 JavaScript 值安全地嵌入字符串（防止单引号破坏 heredoc）
function esc(v) {
  return String(v).replace(/'/g, "'\\''");
}

const egoScript = `const task = await useOrCreateTaskSpace('measure-edit-' + Date.now());
const result = { project: '${esc(projectId)}', baseUrl: '${esc(BASE_URL)}' };

async function navigationTiming() {
  return await js(String.raw\`(() => {
    const entry = performance.getEntriesByType('navigation').at(-1);
    if (!entry) return null;
    return {
      responseStart: Math.round(entry.responseStart),
      domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
      load: Math.round(entry.loadEventEnd),
      duration: Math.round(entry.duration),
      transferSize: entry.transferSize,
    };
  })()\`);
}

async function waitForEditorReady(timeoutSeconds) {
  await waitForElement('[data-testid="editor-ready"]', { timeout: timeoutSeconds });
  return await js(String.raw\`(() => ({
    marker: Boolean(document.querySelector('[data-testid="editor-ready"]')),
    loadingVisible: document.body.innerText.includes('加载中...'),
    url: location.href,
  }))()\`);
}

// ── 登录 ──
${SKIP_LOGIN ? "" : `
{
  await gotoAndWait('${esc(BASE_URL)}/login', { timeout: 20, settle: 0 });
  const onLoginPage = await (async () => {
    try { const b = await js('document.body.innerText'); return b.includes('密码') || b.includes('Password'); } catch (_) { return false; }
  })();
  if (onLoginPage) {
    cliLog('logging in...');
    await fillInput('input[type="text"], input[type="email"]', '${esc(USERNAME)}');
    await fillInput('input[type="password"]', '${esc(getE2EPassword("PASSWORD"))}');
    await click('button[type="submit"]', { label: 'login' });
    await waitForLoad({ timeout: 20 });
  }
}
`}
// ── 冷加载 ──
const coldStart = Date.now();
try {
  await gotoAndWait('${esc(EDIT_URL)}', { timeout: 120, settle: 0 });
  result.coldEditorReady = await waitForEditorReady(120);
} catch (e) {
  result.coldNavError = e.message || String(e);
}
result.coldNavigationMs = Date.now() - coldStart;
result.coldEditorReadyMs = result.coldNavigationMs;
result.coldNavigationTiming = await navigationTiming();

try {
  result.pageContent = await js('document.body.innerText.substring(0, 300)');
} catch (e) { result.pageContent = 'js error: ' + (e.message || e); }

// ── 返回首页 ──
const backStart = Date.now();
await gotoAndWait('${esc(HOME_URL)}', { timeout: 60, settle: 0 });
result.backToHomeMs = Date.now() - backStart;
result.backToHomeNavigationTiming = await navigationTiming();

// ── 热加载 ──
const warmStart = Date.now();
try {
  await gotoAndWait('${esc(EDIT_URL)}', { timeout: 120, settle: 0 });
  result.warmEditorReady = await waitForEditorReady(120);
} catch (e) {
  result.warmNavError = e.message || String(e);
}
result.warmNavigationMs = Date.now() - warmStart;
result.warmEditorReadyMs = result.warmNavigationMs;
result.warmNavigationTiming = await navigationTiming();

cliLog(JSON.stringify(result));`;

const egoCmd = `export PATH="$HOME/.local/bin:$PATH"\nego-browser nodejs <<'EGOSCRIPT' 2>&1\n${egoScript}\nEGOSCRIPT`;

try {
  const stdout = execSync(egoCmd, {
    timeout: 300_000,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines = stdout.split("\n").filter(Boolean);
  let found = false;
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.project) {
        printResult(r, JSON_OUTPUT);
        found = true;
      }
    } catch (_) {
      // 非 JSON 行（cliLog 调试输出），跳过
    }
  }
  if (!found) {
    console.error("❌ 未找到 JSON 结果，原始输出:");
    console.error(stdout.slice(-500));
    process.exitCode = 1;
  }
} catch (e) {
  const stdout = e.stdout || "";
  const stderr = e.stderr || "";

  // 尝试从 stdout 中提取 JSON（ego-browser 可能以非零退出但仍输出结果）
  const lines = stdout.split("\n").filter(Boolean);
  let found = false;
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.project) {
        printResult(r, JSON_OUTPUT);
        found = true;
      }
    } catch (_) {}
  }

  if (!found) {
    console.error("❌ 测量失败:", stderr.slice(-500) || e.message);
    process.exitCode = 1;
  }
}

function printResult(r, jsonOutput) {
  if (jsonOutput) {
    console.log(JSON.stringify(r));
    return;
  }
  console.log("═══════════════════════════════════");
  console.log("  编辑页加载速度测量");
  console.log("═══════════════════════════════════");
  console.log(`  项目:     ${r.project}`);
  console.log(`  服务:     ${r.baseUrl}`);
  console.log("───────────────────────────────────");
  console.log(`  冷加载:   ${r.coldNavigationMs ?? "?"}ms (到编辑器 ready)`);
  if (r.coldNavError) console.log(`            ⚠️ 导航失败: ${r.coldNavError}`);
  if (r.coldEditorReady) console.log(`            ready marker: ${r.coldEditorReady.marker ? "已到达" : "未到达"}`);
  if (r.coldNavigationTiming) console.log(`            responseStart/load: ${r.coldNavigationTiming.responseStart}/${r.coldNavigationTiming.load}ms`);
  if (r.jsError) console.log(`            ❌ JS 错误: ${r.jsError}`);
  if (r.pageContent) {
    const preview = r.pageContent.replace(/\n/g, " ").slice(0, 60);
    console.log(`            内容预览: ${preview}`);
  }
  console.log("───────────────────────────────────");
  console.log(`  返回首页: ${r.backToHomeMs ?? "?"}ms`);
  console.log(`  热加载:   ${r.warmNavigationMs ?? "?"}ms (到编辑器 ready)`);
  if (r.warmEditorReady) console.log(`            ready marker: ${r.warmEditorReady.marker ? "已到达" : "未到达"}`);
  if (r.warmNavigationTiming) console.log(`            responseStart/load: ${r.warmNavigationTiming.responseStart}/${r.warmNavigationTiming.load}ms`);
  console.log("═══════════════════════════════════");

  const coldOk = r.coldEditorReady?.marker && !r.coldEditorReady.loadingVisible && !r.jsError && !r.coldNavError;
  const warmOk = r.warmEditorReady?.marker && !r.warmEditorReady.loadingVisible && !r.warmNavError;
  const coldMs = r.coldNavigationMs || 99999;
  const warmMs = r.warmNavigationMs || 99999;

  if (coldOk && warmOk && coldMs < 8000 && warmMs < 5000) {
    console.log("✅ 加载速度正常");
  } else if (coldOk && warmMs >= 5000) {
    console.log("⚠️ 冷加载正常，热加载偏慢");
  } else if (coldMs >= 8000) {
    console.log("⚠️ 冷加载偏慢，请检查服务和网络");
  } else {
    console.log("❌ 加载异常，检查上方错误信息");
  }
}
