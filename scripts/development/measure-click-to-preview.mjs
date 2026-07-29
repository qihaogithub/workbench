#!/usr/bin/env node

/**
 * 测量编辑页点击页面切换 → 预览更新的端到端延迟
 *
 * 测量流程:
 * 1. 导航到编辑页，等待加载完成
 * 2. 点击页面树中某个非当前页，记录时间戳
 * 3. 等待预览 iframe 更新，记录时间戳
 * 4. 计算端到端延迟
 *
 * 用法:
 *   pnpm measure:click-to-preview [projectId]
 *   或
 *   node scripts/development/measure-click-to-preview.mjs [projectId]
 *
 * 环境变量:
 *   BASE_URL  — 创作端地址（默认 http://localhost:3200）
 *   PROJECT_ID — 项目 ID（默认取 data/projects/ 下第一个）
 *   USERNAME / PASSWORD — 登录凭据
 *   NO_LOGIN — 设为 1 跳过自动登录
 *   CLICKS — 点击次数（默认 5）
 */

import { execSync } from "child_process";
import { readdirSync } from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3200";
const USERNAME = process.env.USERNAME || "qihao";
const PASSWORD = process.env.PASSWORD || "130015";
const SKIP_LOGIN = process.env.NO_LOGIN === "1";
const CLICKS = Math.max(1, Number(process.env.CLICKS) || 5);

function getDefaultProject() {
  try {
    return readdirSync("data/projects")[0] || "";
  } catch {
    return "";
  }
}

const projectId = process.argv[2] || process.env.PROJECT_ID || getDefaultProject();

if (!projectId) {
  console.error("❌ 未找到项目，请指定 projectId");
  console.error("   用法: node scripts/development/measure-click-to-preview.mjs <projectId>");
  process.exit(1);
}

const EDIT_URL = `${BASE_URL}/demo/${projectId}/edit`;

function esc(v) {
  return String(v).replace(/'/g, "'\\''");
}

const egoScript = `const task = await useOrCreateTaskSpace('click-preview-' + Date.now());
const result = { project: '${esc(projectId)}', baseUrl: '${esc(BASE_URL)}', clicks: [] };

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

// ── 导航到编辑页并等待加载完成 ──
cliLog('navigating to edit page...');
await gotoAndWait('${esc(EDIT_URL)}', { timeout: 60, settle: 3 });
await wait(3);

// 等待加载中消失
for (let i = 0; i < 30; i++) {
  try {
    const stillLoading = await js('document.body.innerText.includes("加载中")');
    if (!stillLoading) break;
  } catch (_) { break; }
  await wait(2);
}

await wait(2);

// ── 查找可点击的页面列表项 ──
// 尝试多种方式定位页面节点
const pageItems = await js(
  "(function() {" +
    "  var items = [];" +
    "  var tree = document.querySelector('[data-page-tree]');" +
    "  if (!tree) {" +
    "    var panels = document.querySelectorAll('[role=\"treeitem\"], [data-page-id]');" +
    "    panels.forEach(function(el) {" +
    "      var name = (el.textContent || '').trim().slice(0, 50);" +
    "      var pageId = el.getAttribute('data-page-id');" +
    "      if (name) items.push({ tag: el.tagName, name: name, pageId: pageId });" +
    "    });" +
    "  }" +
    "  if (items.length === 0) {" +
    "    document.querySelectorAll('button, [role=\"button\"], a').forEach(function(el) {" +
    "      var text = (el.textContent || '').trim();" +
    "      if (text && text.length > 0 && text.length < 100) {" +
    "        var rect = el.getBoundingClientRect();" +
    "        if (rect.width > 0 && rect.height > 0 && rect.left > 0 && rect.left < 400) {" +
    "          items.push({ tag: el.tagName, name: text.slice(0, 50), x: Math.round(rect.x), y: Math.round(rect.y) });" +
    "        }" +
    "      }" +
    "    });" +
    "  }" +
    "  return items.slice(0, 10);" +
    "})()",
);

cliLog('found ' + (pageItems ? pageItems.length : 0) + ' potential page items');

if (!pageItems || pageItems.length < 2) {
  result.error = 'not_enough_pages';
  result.pageItems = pageItems || [];
  cliLog(JSON.stringify(result));
} else {
  // ── 执行点击并测量延迟 ──
  const CLICKS = Math.min(${CLICKS}, pageItems.length - 1);

  for (let i = 0; i < CLICKS; i++) {
    const target = pageItems[i + 1]; // 跳过第一个（当前页），从第二个开始

    cliLog('clicking page ' + (i + 1) + ': ' + (target.name || target.pageId || 'unknown'));

    // 记录点击前时间
    const beforeClick = Date.now();

    // 查找 PreviewPanel 的 iframe 用于检测变化
    const iframeInfo = await js(
      "(function() {" +
        "  var iframe = document.querySelector('.preview-panel-iframe');" +
        "  if (!iframe) return null;" +
        "  return { src: iframe.src, ready: true };" +
        "})()",
    );

    // 点击目标元素
    try {
      if (target.pageId) {
        await click('[data-page-id="' + target.pageId + '"]', { label: 'page-' + target.pageId, timeout: 5 });
      } else {
        await click('button:has-text("' + (target.name || '').replace(/"/g, '\\"') + '")', { timeout: 5 });
      }
    } catch (e) {
      // 尝试坐标点击
      try {
        await click({ x: target.x + 10, y: target.y + 10 }, { label: 'page-coord' });
      } catch (e2) {
        result.clicks.push({ run: i + 1, error: 'click_failed: ' + (e2.message || String(e2)) });
        continue;
      }
    }

    // 等待 DOM 稳定（React 重渲染完成）
    await wait(1);

    // 检测 iframe 是否已更新（通过检查新的 src 或内容和之前不同）
    const afterClick = Date.now();

    try {
      const updatedInfo = await js(
        "(function() {" +
          "  var iframe = document.querySelector('.preview-panel-iframe');" +
          "  if (!iframe) return { found: false };" +
          "  var loadingOverlay = document.querySelector('[aria-label=\"预览加载中\"]');" +
          "  var hasLoading = !!(loadingOverlay && window.getComputedStyle(loadingOverlay).display !== 'none');" +
          "  return {" +
          "    found: true," +
          "    src: iframe.src," +
          "    hasLoading: hasLoading," +
          "    opacity: iframe.style.opacity," +
          "  };" +
          "})()",
      );

      const visibleMs = Date.now() - beforeClick;

      result.clicks.push({
        run: i + 1,
        target: target.name || target.pageId || 'unknown',
        totalMs: visibleMs,
        iframeBefore: iframeInfo?.src || 'n/a',
        iframeAfter: updatedInfo?.src || 'n/a',
        hadLoadingOverlay: updatedInfo?.hasLoading,
      });
    } catch (e) {
      result.clicks.push({ run: i + 1, jsError: String(e) });
    }

    await wait(1);
  }

  // ── 汇总 ──
  const validClicks = result.clicks.filter(c => !c.error && !c.jsError && c.totalMs != null);
  if (validClicks.length > 0) {
    const totals = validClicks.map(c => c.totalMs);
    result.summary = {
      samples: validClicks.length,
      totalMs: {
        min: Math.min(...totals),
        max: Math.max(...totals),
        avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
        p50: totals.sort((a, b) => a - b)[Math.floor(totals.length / 2)],
        p95: totals.sort((a, b) => a - b)[Math.floor(totals.length * 0.95)],
      },
    };
  }

  // ── 额外测量：使用 CDP Performance 追踪点击延迟 ──
  try {
    await cdp('Performance.enable');
  } catch (_) {}

  // 再做一次精细测量
  if (pageItems.length > validClicks.length + 1) {
    const extras = pageItems[validClicks.length + 1];
    if (extras) {
      const t0 = Date.now();
      try {
        if (extras.pageId) {
          await click('[data-page-id="' + extras.pageId + '"]', { timeout: 5 });
        } else {
          await click({ x: extras.x + 10, y: extras.y + 10 }, { timeout: 5 });
        }
        await wait(0.5);
        const t1 = Date.now();
        result.clicks.push({
          run: 'cdp-extra',
          target: extras.name || extras.pageId || 'unknown',
          totalMs: t1 - t0,
          method: 'cdp_trace',
        });
      } catch (_) {}
    }
  }

  try { await cdp('Performance.disable'); } catch (_) {}
}

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
      if (r.project && (r.clicks || r.error)) {
        printResult(r);
        found = true;
      }
    } catch (_) {}
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
      if (r.project && (r.clicks || r.error)) {
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
  console.log("  编辑页点击 → 预览延迟");
  console.log("═══════════════════════════════════");
  console.log(`  项目:     ${r.project}`);
  console.log(`  服务:     ${r.baseUrl}`);
  console.log(`  找到页面项: ${r.pageItems?.length || 0}`);
  console.log("───────────────────────────────────");

  if (r.error) {
    console.log(`  ❌ ${r.error}`);
    if (r.pageItems?.length === 1) {
      console.log("  ⚠️ 该项目只有 1 页，无法测量页面切换。");
      console.log("     请使用至少 2 页的项目，或手动点击测试。");
    }
    if (r.pageItems?.length === 0) {
      console.log("  ⚠️ 未找到页面树元素。请确认编辑页加载完成。");
    }
    console.log("═══════════════════════════════════");
    return;
  }

  for (const c of r.clicks) {
    if (c.error) {
      console.log(`  [${c.run}] ❌ ${c.error}`);
    } else if (c.jsError) {
      console.log(`  [${c.run}] ❌ ${c.jsError}`);
    } else {
      console.log(`  [${c.run}] "${c.target}" → ${c.totalMs}ms`);
    }
  }

  if (r.summary) {
    console.log("───────────────────────────────────");
    const s = r.summary;
    console.log(`  样本数: ${s.samples}`);
    console.log(`  min: ${s.totalMs.min}ms`);
    console.log(`  avg: ${s.totalMs.avg}ms`);
    console.log(`  p50: ${s.totalMs.p50}ms`);
    console.log(`  p95: ${s.totalMs.p95}ms`);
    console.log(`  max: ${s.totalMs.max}ms`);

    if (s.totalMs.p95 > 2000) {
      console.log("  ❌ p95 延迟过高 (>2s)，存在明显点击延迟");
    } else if (s.totalMs.p95 > 1000) {
      console.log("  ⚠️ p95 延迟偏高 (1-2s)，体感有延迟");
    } else if (s.totalMs.p95 > 500) {
      console.log("  ⚡ p95 延迟可接受 (0.5-1s)");
    } else {
      console.log("  ✅ p95 延迟正常 (<500ms)");
    }
  }

  console.log("═══════════════════════════════════");
}
