#!/usr/bin/env node

/**
 * 测量创作端编辑页加载速度 —— ego-browser 自动化脚本
 *
 * 用法:
 *   pnpm measure:edit-page-load [projectId]
 *   或
 *   node scripts/development/measure-edit-page-load.mjs [projectId]
 *
 * 环境变量:
 *   BASE_URL  — 创作端地址（默认 http://localhost:3200）
 *   PROJECT_ID — 项目 ID（默认取 data/projects/ 下第一个）
 *   USERNAME / PASSWORD — 登录凭据（默认 qihao / 130015）
 *   NO_LOGIN — 设为 1 跳过自动登录
 *
 * 输出:
 *   - 冷/热加载导航耗时
 *   - 加载中状态持续时间
 *   - 返回首页耗时
 */

import { execSync } from "child_process";
import { readdirSync } from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3200";
const USERNAME = process.env.USERNAME || "qihao";
const PASSWORD = process.env.PASSWORD || "130015";
const SKIP_LOGIN = process.env.NO_LOGIN === "1";

function getDefaultProject() {
  try {
    const dirs = readdirSync("data/projects");
    return dirs[0] || "";
  } catch {
    return "";
  }
}

const projectId = process.argv[2] || process.env.PROJECT_ID || getDefaultProject();

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

// ── 登录 ──
${SKIP_LOGIN ? "" : `
{
  await gotoAndWait('${esc(BASE_URL)}/login', { timeout: 20, settle: 2 });
  await wait(3);
  const onLoginPage = await (async () => {
    try { const b = await js('document.body.innerText'); return b.includes('密码') || b.includes('Password'); } catch (_) { return false; }
  })();
  if (onLoginPage) {
    cliLog('logging in...');
    await fillInput('input[type="text"], input[type="email"]', '${esc(USERNAME)}');
    await fillInput('input[type="password"]', '${esc(PASSWORD)}');
    await click('button[type="submit"]', { label: 'login' });
    await wait(5);
  }
}
`}
// ── 冷加载 ──
const coldStart = Date.now();
try {
  await gotoAndWait('${esc(EDIT_URL)}', { timeout: 60, settle: 3 });
} catch (e) {
  result.coldNavError = e.message || String(e);
}
result.coldNavigationMs = Date.now() - coldStart;

for (let i = 0; i < 30; i++) {
  try {
    const stillLoading = await js('document.body.innerText.includes("加载中")');
    if (!stillLoading) { result.loadingDurationS = (i + 1) * 2; break; }
  } catch (e) { result.jsError = e.message || String(e); break; }
  await wait(2);
}
if (result.loadingDurationS == null) result.loadingTimedOut = true;

try {
  result.pageContent = await js('document.body.innerText.substring(0, 300)');
} catch (e) { result.pageContent = 'js error: ' + (e.message || e); }

// ── 返回首页 ──
const backStart = Date.now();
await gotoAndWait('${esc(HOME_URL)}', { timeout: 20, settle: 2 });
result.backToHomeMs = Date.now() - backStart;

// ── 热加载 ──
const warmStart = Date.now();
await gotoAndWait('${esc(EDIT_URL)}', { timeout: 60, settle: 3 });
result.warmNavigationMs = Date.now() - warmStart;

for (let i = 0; i < 15; i++) {
  try {
    if (!(await js('document.body.innerText.includes("加载中")'))) {
      result.warmLoadingDurationS = (i + 1) * 2; break;
    }
  } catch (_) { break; }
  await wait(2);
}
if (result.warmLoadingDurationS == null) result.warmLoadingTimedOut = true;

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
        printResult(r);
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
        printResult(r);
        found = true;
      }
    } catch (_) {}
  }

  if (!found) {
    console.error("❌ 测量失败:", stderr.slice(-500) || e.message);
    process.exitCode = 1;
  }
}

function printResult(r) {
  console.log("═══════════════════════════════════");
  console.log("  编辑页加载速度测量");
  console.log("═══════════════════════════════════");
  console.log(`  项目:     ${r.project}`);
  console.log(`  服务:     ${r.baseUrl}`);
  console.log("───────────────────────────────────");
  console.log(`  冷加载:   ${r.coldNavigationMs ?? "?"}ms (导航)`);
  if (r.coldNavError) console.log(`            ⚠️ 导航失败: ${r.coldNavError}`);
  if (r.loadingDurationS != null) {
    console.log(`            加载中持续 ${r.loadingDurationS}s`);
  } else if (r.loadingTimedOut) {
    console.log(`            ⚠️ 加载中状态超时 (>60s)`);
  }
  if (r.jsError) console.log(`            ❌ JS 错误: ${r.jsError}`);
  if (r.pageContent) {
    const preview = r.pageContent.replace(/\n/g, " ").slice(0, 60);
    console.log(`            内容预览: ${preview}`);
  }
  console.log("───────────────────────────────────");
  console.log(`  返回首页: ${r.backToHomeMs ?? "?"}ms`);
  console.log(`  热加载:   ${r.warmNavigationMs ?? "?"}ms (导航)`);
  if (r.warmLoadingDurationS != null) {
    console.log(`            加载中持续 ${r.warmLoadingDurationS}s`);
  } else if (r.warmLoadingTimedOut) {
    console.log(`            ⚠️ 加载中状态超时`);
  }
  console.log("═══════════════════════════════════");

  const coldOk = r.loadingDurationS != null && !r.jsError && !r.coldNavError;
  const warmOk = r.warmLoadingDurationS != null;
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
