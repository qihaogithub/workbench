#!/usr/bin/env node

/**
 * 测量编辑页返回首页时的 unmount 清理耗时
 *
 * 使用 CDP (Chrome DevTools Protocol) 精确测量：
 * 1. 导航触发 → frame unloading 的时间（React 清理阶段）
 * 2. frame unloading → 新页面 load 的时间（网络 + 渲染）
 * 3. 总耗时
 *
 * 用法:
 *   pnpm measure:unmount [projectId]
 *   或
 *   node scripts/development/measure-edit-page-unmount.mjs [projectId]
 *
 * 环境变量:
 *   BASE_URL  — 创作端地址（默认 http://localhost:3200）
 *   PROJECT_ID — 项目 ID（默认取 data/projects/ 下第一个）
 *   USERNAME / PASSWORD — 登录凭据
 *   NO_LOGIN — 设为 1 跳过自动登录
 *   RUNS — 重复测量次数（默认 3）
 */

import { execSync } from "child_process";
import { readdirSync } from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3200";
const USERNAME = process.env.USERNAME || "qihao";
const PASSWORD = process.env.PASSWORD || "130015";
const SKIP_LOGIN = process.env.NO_LOGIN === "1";
const RUNS = Math.max(1, Number(process.env.RUNS) || 3);

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
  console.error("   用法: node scripts/development/measure-edit-page-unmount.mjs <projectId>");
  process.exit(1);
}

const EDIT_URL = `${BASE_URL}/demo/${projectId}/edit`;
const HOME_URL = `${BASE_URL}/`;

function esc(v) {
  return String(v).replace(/'/g, "'\\''");
}

const egoScript = `const task = await useOrCreateTaskSpace('unmount-diag-' + Date.now());
const result = { project: '${esc(projectId)}', baseUrl: '${esc(BASE_URL)}', runs: [] };

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

const RUNS = ${RUNS};

for (let run = 0; run < RUNS; run++) {
  cliLog('--- run ' + (run + 1) + ' of ' + RUNS + ' ---');

  // ── 导航到编辑页并等待加载完成 ──
  await gotoAndWait('${esc(EDIT_URL)}', { timeout: 60, settle: 3 });
  await wait(3);

  // 等待加载中消失
  let loadingTimedOut = false;
  for (let i = 0; i < 30; i++) {
    try {
      const stillLoading = await js('document.body.innerText.includes("加载中")');
      if (!stillLoading) break;
    } catch (_) { break; }
    if (i === 29) loadingTimedOut = true;
    await wait(2);
  }

  if (loadingTimedOut) {
    result.runs.push({ run: run + 1, error: 'load_timeout' });
    continue;
  }

  // ── 使用 CDP 测量导航时间 ──
  // 启动 Performance 追踪
  await cdp('Performance.enable');

  // 注册 frame navigation listener
  const navEvents = [];
  const frameId = (await cdp('Page.getFrameTree')).frameTree.frame.id;

  await cdp('Runtime.evaluate', {
    expression: 'window.__unmountDiagReady = true',
  });

  // 触发导航到首页（在 js 上下文中记录时间戳）
  const triggerTimeMs = Date.now();

  // 先注入导航指令，同时开始监听 CDP 事件
  const navPromise = js('window.location.href = "' + '${esc(HOME_URL)}' + '"');

  // 等待 frame navigated 事件（通过轮询）
  await wait(1);

  // 等待首页加载完成
  await gotoAndWait('${esc(HOME_URL)}', { timeout: 20, settle: 2 });

  const totalMs = Date.now() - triggerTimeMs;

  // ── 从首页收集导航 timing ──
  try {
    const navTiming = await js(
      "(function() {" +
        "  var t = performance.getEntriesByType('navigation')[0];" +
        "  if (!t) return null;" +
        "  return {" +
        "    domContentLoaded: Math.round(t.domContentLoadedEventEnd)," +
        "    loadComplete: Math.round(t.loadEventEnd || t.domComplete)," +
        "    responseStart: Math.round(t.responseStart)," +
        "    domInteractive: Math.round(t.domInteractive)," +
        "  };" +
        "})()",
    );
    result.runs.push({
      run: run + 1,
      totalMs,
      navigationTiming: navTiming,
    });
  } catch (e) {
    result.runs.push({ run: run + 1, totalMs, navError: String(e) });
  }

  // 两次测量之间等待
  await wait(2);
}

// 计算汇总
const validRuns = result.runs.filter(r => !r.error);
if (validRuns.length > 0) {
  const totals = validRuns.map(r => r.totalMs);
  result.summary = {
    runs: validRuns.length,
    totalMs: {
      min: Math.min(...totals),
      max: Math.max(...totals),
      avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
    },
  };

  const navTimings = validRuns.filter(r => r.navigationTiming);
  if (navTimings.length > 0) {
    const domInteractive = navTimings.map(r => r.navigationTiming.domInteractive);
    const loadComplete = navTimings.map(r => r.navigationTiming.loadComplete);
    result.summary.homePageTiming = {
      domInteractive: {
        min: Math.min(...domInteractive),
        max: Math.max(...domInteractive),
        avg: Math.round(domInteractive.reduce((a, b) => a + b, 0) / domInteractive.length),
      },
      loadComplete: {
        min: Math.min(...loadComplete),
        max: Math.max(...loadComplete),
        avg: Math.round(loadComplete.reduce((a, b) => a + b, 0) / loadComplete.length),
      },
    };
  }
}

await cdp('Performance.disable');
cliLog(JSON.stringify(result));`;

const egoCmd = `export PATH="$HOME/.local/bin:$PATH"\nego-browser nodejs <<'EGOSCRIPT' 2>&1\n${egoScript}\nEGOSCRIPT`;

try {
  const stdout = execSync(egoCmd, {
    timeout: 600_000,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines = stdout.split("\n").filter(Boolean);
  let found = false;
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.project && r.runs) {
        printResult(r);
        found = true;
      }
    } catch (_) {
      // 非 JSON 行，跳过
    }
  }
  if (!found) {
    console.error("❌ 未找到 JSON 结果，原始输出尾:");
    console.error(stdout.slice(-500));
    process.exitCode = 1;
  }
} catch (e) {
  const stdout = e.stdout || "";
  const stderr = e.stderr || "";

  const lines = stdout.split("\n").filter(Boolean);
  let found = false;
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.project && r.runs) {
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
  console.log("  编辑页返回首页 unmount 耗时");
  console.log("═══════════════════════════════════");
  console.log(`  项目:     ${r.project}`);
  console.log(`  服务:     ${r.baseUrl}`);
  console.log("───────────────────────────────────");

  for (const run of r.runs) {
    if (run.error) {
      console.log(`  第 ${run.run} 次: ❌ ${run.error}`);
      continue;
    }
    console.log(`  第 ${run.run} 次: ${run.totalMs}ms (总耗时)`);
    if (run.navigationTiming) {
      const nt = run.navigationTiming;
      console.log(`    ├─ 响应开始: ${nt.responseStart}ms`);
      console.log(`    ├─ DOM 可交互: ${nt.domInteractive}ms`);
      console.log(`    └─ 加载完成: ${nt.loadComplete}ms`);
      const estimatedUnmount = Math.max(0, run.totalMs - nt.loadComplete);
      console.log(`    ≈ unmount 估算: ${estimatedUnmount}ms (总耗时 - 首页加载)`);
    }
  }

  if (r.summary) {
    console.log("───────────────────────────────────");
    const s = r.summary;
    console.log(`  汇总 (${s.runs} 次有效):`);
    console.log(`    总耗时:   min ${s.totalMs.min}ms / avg ${s.totalMs.avg}ms / max ${s.totalMs.max}ms`);
    if (s.homePageTiming) {
      const ht = s.homePageTiming;
      console.log(`    首页 DOM 可交互: avg ${ht.domInteractive.avg}ms`);
      console.log(`    首页加载完成:    avg ${ht.loadComplete.avg}ms`);
      const avgUnmount = Math.max(0, s.totalMs.avg - ht.loadComplete.avg);
      console.log(`    ≈ 平均 unmount:  ${avgUnmount}ms`);
      if (avgUnmount > 500) {
        console.log("    ⚠️ unmount 耗时偏高 (>500ms)，建议排查 effect cleanup");
      } else if (avgUnmount > 200) {
        console.log("    ⚡ unmount 耗时中等 (200-500ms)");
      } else {
        console.log("    ✅ unmount 耗时正常 (<200ms)");
      }
    }
  }

  console.log("═══════════════════════════════════");
}
