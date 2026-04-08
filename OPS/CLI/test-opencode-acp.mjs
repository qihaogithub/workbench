// 手动测试 opencode ACP
import { spawn } from "child_process";

const workingDir =
  "C:\\Users\\Administrator\\AppData\\Local\\Temp\\test-opencode-workspace";

console.log("工作目录:", workingDir);
console.log("启动 opencode ACP...\n");

// 创建目录
import { mkdirSync, existsSync } from "fs";
if (!existsSync(workingDir)) {
  mkdirSync(workingDir, { recursive: true });
}

const child = spawn("opencode", ["acp"], {
  cwd: workingDir,
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
});

let stdoutBuffer = "";
let stderrBuffer = "";

child.stdout.on("data", (data) => {
  const text = data.toString();
  stdoutBuffer += text;
  console.log("[STDOUT]", JSON.stringify(text));
});

child.stderr.on("data", (data) => {
  const text = data.toString();
  stderrBuffer += text;
  console.error("[STDERR]", text);
});

child.on("exit", (code, signal) => {
  console.log("\n进程退出 - 代码:", code, "信号:", signal);
  console.log("\n完整的 STDERR:");
  console.error(stderrBuffer);
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error("\n子进程错误:", error.message);
  console.error("堆栈:", error.stack);
});

// 等待 2 秒让进程启动,然后发送 session/new 请求
setTimeout(() => {
  console.log("\n=== 发送 session/new 请求 ===\n");

  const sessionNew = {
    jsonrpc: "2.0",
    id: 1,
    method: "session/new",
    params: {
      cwd: workingDir,
      mcpServers: [],
      agent: "build", // 显式指定 agent
    },
  };

  console.log("发送:", JSON.stringify(sessionNew));
  child.stdin.write(JSON.stringify(sessionNew) + "\n");

  // 等待响应,然后发送 session/prompt
  setTimeout(() => {
    console.log("\n=== 发送 session/prompt 请求 ===\n");

    const prompt = {
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: {
        sessionId: "pending", // 我们会从 session/new 的响应中获取
        prompt: [{ type: "text", text: "你好,请回复我" }],
      },
    };

    console.log("注意:sessionId 需要从上面的响应中获取");
    console.log("等待查看 session/new 响应后再继续...");

    // 再等待 3 秒查看输出
    setTimeout(() => {
      console.log("\n=== 测试完成,等待进程退出 ===");
      // 不主动杀进程,让它自然退出
      setTimeout(() => {
        console.log("\n30 秒超时,强制退出");
        child.kill();
      }, 30000);
    }, 3000);
  }, 3000);
}, 2000);
