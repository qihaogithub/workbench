#!/usr/bin/env node
/**
 * SSE 事件诊断脚本
 *
 * 用途：连接 OpenCode Server 的 SSE 端点，捕获 AI 编辑过程中的所有事件，
 *       定位 session.diff 是否到达、与 session.idle 的时序关系。
 *
 * 使用方法：
 *   1. 确保 OpenCode Server 运行在 localhost:4096
 *   2. node scripts/diagnose-sse-events.mjs
 *   3. 脚本会自动创建 session → 连接 SSE → 发送消息 → 记录所有事件
 */

const SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://localhost:4096";
const WORKING_DIR = process.env.WORKING_DIR || "/tmp/sse-diag-" + Date.now();

// ── 颜色输出 ──
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function ts() {
  return new Date().toISOString().split("T")[1];
}

function log(color, prefix, msg) {
  console.log(
    `${c.gray}[${ts()}]${c.reset} ${color}${c.bold}${prefix}${c.reset} ${msg}`,
  );
}

// ── 步骤 1：检查 Server 健康 ──
async function checkHealth() {
  log(c.cyan, "[STEP 1]", `检查 OpenCode Server 健康状态 (${SERVER_URL})`);
  try {
    const resp = await fetch(`${SERVER_URL}/global/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      log(c.green, "[OK]", "Server 健康检查通过");
      return true;
    }
    log(c.red, "[FAIL]", `Server 返回 ${resp.status}`);
    return false;
  } catch (e) {
    log(c.red, "[FAIL]", `无法连接 Server: ${e.message}`);
    return false;
  }
}

// ── 步骤 2：创建 Session ──
async function createSession() {
  log(c.cyan, "[STEP 2]", `创建 OpenCode Session (workingDir: ${WORKING_DIR})`);
  const resp = await fetch(`${SERVER_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `sse-diag-${Date.now()}`,
      workingDir: WORKING_DIR,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok)
    throw new Error(`创建 Session 失败: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  log(c.green, "[OK]", `Session 创建成功: ${c.bold}${data.id}${c.reset}`);
  return data.id;
}

// ── 步骤 3：连接 SSE 并发送消息 ──
async function monitorSSE(sessionId) {
  log(
    c.cyan,
    "[STEP 3]",
    `连接 SSE 端点: ${SERVER_URL}/event?sessionId=${sessionId}`,
  );

  // 从 pnpm 存储引入 eventsource
  let EventSource;
  try {
    const mod =
      await import("../node_modules/.pnpm/eventsource@4.1.0/node_modules/eventsource/dist/index.js");
    EventSource = mod.EventSource;
  } catch (e) {
    console.error(`${c.red}无法加载 eventsource: ${e.message}${c.reset}`);
    console.error("请确认 packages/agent-service 已安装依赖");
    process.exit(1);
  }
  const events = [];
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const es = new EventSource(`${SERVER_URL}/event?sessionId=${sessionId}`);

    es.onopen = () => {
      log(c.green, "[OK]", "SSE 连接建立");
    };

    es.onmessage = (event) => {
      const elapsed = Date.now() - startTime;
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || "unknown";
        const entry = { time: elapsed, type: eventType, data };
        events.push(entry);

        // 按类型着色
        let color = c.gray;
        if (eventType.includes("diff")) color = c.yellow;
        else if (eventType.includes("idle") || eventType.includes("status"))
          color = c.magenta;
        else if (eventType.includes("delta") || eventType.includes("stream"))
          color = c.cyan;
        else if (eventType.includes("part")) color = c.blue;
        else if (eventType.includes("error")) color = c.red;

        // 精简显示
        let summary = "";
        if (eventType === "message.part.delta") {
          const delta = data.properties?.delta || "";
          summary = `delta="${delta.substring(0, 60)}${delta.length > 60 ? "..." : ""}" (${delta.length} chars)`;
        } else if (eventType === "message.part.updated") {
          summary = `part.type=${data.properties?.part?.type || "?"}`;
        } else if (eventType === "session.diff") {
          const diffs = data.properties?.diff || [];
          summary = `${diffs.length} file(s) changed:`;
          for (const d of diffs) {
            summary += `\n    ${c.yellow}→ ${d.file} (+${d.additions}/-${d.deletions}, after=${d.after?.length || 0} chars)`;
          }
        } else if (eventType === "session.idle") {
          summary = "⚡ AI 完成 (session idle)";
        } else if (eventType === "session.status") {
          summary = `status=${data.properties?.status?.type || "?"}`;
        } else if (eventType === "file.edited") {
          summary = `file=${data.properties?.file || "?"}`;
        } else if (eventType === "server.heartbeat") {
          summary = "heartbeat";
        } else {
          summary = JSON.stringify(data.properties || {}).substring(0, 120);
        }

        log(
          color,
          `[+${String(elapsed).padStart(5)}ms]`,
          `${eventType}  ${summary}`,
        );

        // 检测到 idle 后等待一段时间再结束（看是否还有 diff 事件）
        if (
          eventType === "session.idle" ||
          (eventType === "session.status" &&
            data.properties?.status?.type === "idle")
        ) {
          log(
            c.magenta,
            "[IDLE]",
            `AI 完成，继续监听 3 秒看是否有延迟的 session.diff...`,
          );
          setTimeout(() => {
            es.close();
            resolve(events);
          }, 3000);
        }
      } catch (e) {
        log(c.red, "[PARSE ERROR]", `解析 SSE 事件失败: ${e.message}`);
        log(c.gray, "[RAW]", event.data.substring(0, 200));
      }
    };

    es.onerror = (err) => {
      log(c.red, "[SSE ERROR]", `SSE 连接错误`);
      // Don't reject - might be normal close
    };

    // 超时保护（60秒）
    setTimeout(() => {
      log(c.yellow, "[TIMEOUT]", "60 秒超时，停止监听");
      es.close();
      resolve(events);
    }, 60000);

    // 发送测试消息（让 AI 写一个简单的文件）
    setTimeout(async () => {
      log(c.cyan, "[STEP 4]", "发送 AI 消息（请求修改文件）...");
      try {
        const msgResp = await fetch(
          `${SERVER_URL}/session/${sessionId}/prompt_async`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parts: [
                {
                  type: "text",
                  text: "请创建一个文件 index.tsx，内容为一个简单的 React 组件：export default function App() { return <div>Hello World</div> }",
                },
              ],
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!msgResp.ok) {
          log(
            c.red,
            "[FAIL]",
            `发送消息失败: ${msgResp.status} ${await msgResp.text()}`,
          );
          es.close();
          resolve(events);
        } else {
          log(c.green, "[OK]", "消息已发送，等待 SSE 事件...");
        }
      } catch (e) {
        log(c.red, "[FAIL]", `发送消息异常: ${e.message}`);
        es.close();
        resolve(events);
      }
    }, 1000);
  });
}

// ── 步骤 5：分析结果 ──
function analyzeResults(events) {
  console.log("\n" + "=".repeat(80));
  log(c.bold, "[分析报告]", "");
  console.log("=".repeat(80));

  console.log(`\n共接收 ${c.bold}${events.length}${c.reset} 个 SSE 事件\n`);

  // 统计各类型事件
  const typeCounts = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  console.log("事件类型统计:");
  for (const [type, count] of Object.entries(typeCounts)) {
    let color = c.gray;
    if (type.includes("diff")) color = c.yellow;
    if (type.includes("idle")) color = c.magenta;
    console.log(`  ${color}${type}: ${count}${c.reset}`);
  }

  // 关键事件时序
  const diffEvents = events.filter((e) => e.type === "session.diff");
  const idleEvents = events.filter(
    (e) =>
      e.type === "session.idle" ||
      (e.type === "session.status" &&
        e.data?.properties?.status?.type === "idle"),
  );

  console.log("\n关键事件时序:");
  if (diffEvents.length > 0) {
    log(c.green, "[✅]", `session.diff 到达: ${diffEvents.length} 次`);
    for (const d of diffEvents) {
      const files = d.data?.properties?.diff?.map((f) => f.file) || [];
      console.log(`       时间: +${d.time}ms, 文件: ${files.join(", ")}`);
    }
  } else {
    log(c.red, "[❌]", "session.diff 未到达！文件变更数据完全缺失");
  }

  if (idleEvents.length > 0) {
    log(c.magenta, "[IDLE]", `session.idle 到达: +${idleEvents[0].time}ms`);
  }

  if (diffEvents.length > 0 && idleEvents.length > 0) {
    const diffTime = diffEvents[0].time;
    const idleTime = idleEvents[0].time;
    if (diffTime < idleTime) {
      log(
        c.green,
        "[时序]",
        `session.diff (+${diffTime}ms) 在 session.idle (+${idleTime}ms) 之前到达 ✅`,
      );
    } else {
      log(
        c.red,
        "[时序]",
        `session.diff (+${diffTime}ms) 在 session.idle (+${idleTime}ms) 之后到达 ❌ 时序竞争！`,
      );
    }
  }

  // 诊断结论
  console.log("\n" + "-".repeat(80));
  console.log(`${c.bold}诊断结论:${c.reset}`);
  if (diffEvents.length === 0) {
    console.log(`  ${c.red}❌ session.diff 事件未发送或未到达${c.reset}`);
    console.log("  → 根因: OpenCode Server 未发送 session.diff SSE 事件");
    console.log("  → 建议: 检查 Server 版本/配置，或在流结束后主动拉取 diff");
  } else if (idleEvents.length > 0 && diffEvents[0].time > idleEvents[0].time) {
    console.log(
      `  ${c.red}❌ session.diff 在 session.idle 之后到达（时序竞争）${c.reset}`,
    );
    console.log("  → 根因: SSE 在 session.idle 时被关闭，session.diff 被丢弃");
    console.log("  → 建议: 延迟关闭 SSE，或在关闭前主动拉取 diff");
  } else {
    console.log(
      `  ${c.green}✅ session.diff 正常到达且在 session.idle 之前${c.reset}`,
    );
    console.log("  → 问题可能在前端事件处理链路，需检查浏览器日志");
  }
  console.log("");
}

// ── 主流程 ──
async function main() {
  console.log(
    `\n${c.bold}╔══════════════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}║          SSE 事件诊断工具 — AI 编辑后预览不更新            ║${c.reset}`,
  );
  console.log(
    `${c.bold}╚══════════════════════════════════════════════════════════════╝${c.reset}\n`,
  );

  const healthy = await checkHealth();
  if (!healthy) {
    console.log(
      `\n${c.red}请确保 OpenCode Server 运行在 ${SERVER_URL}${c.reset}`,
    );
    process.exit(1);
  }

  const sessionId = await createSession();
  const events = await monitorSSE(sessionId);
  analyzeResults(events);

  // 清理会话
  try {
    await fetch(`${SERVER_URL}/session/${sessionId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(3000),
    });
    log(c.gray, "[CLEANUP]", `Session ${sessionId} 已删除`);
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(`${c.red}诊断脚本异常: ${e.message}${c.reset}`);
  process.exit(1);
});
