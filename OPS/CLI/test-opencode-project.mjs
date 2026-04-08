// 测试: 在项目目录中启动 opencode ACP
import { spawn } from 'child_process';

// 使用项目目录而不是 temp
const workingDir = 'E:\\重要文件\\Programming\\1_Work\\opencode工作台';

console.log('工作目录:', workingDir);
console.log('启动 opencode ACP...\n');

const child = spawn('opencode', ['acp'], {
  cwd: workingDir,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
});

let stdoutBuffer = '';
let stderrBuffer = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  stdoutBuffer += text;
  console.log('[STDOUT]', JSON.stringify(text.substring(0, 200)));
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  stderrBuffer += text;
  console.error('[STDERR]', text.substring(0, 200));
});

child.on('exit', (code, signal) => {
  console.log('\n进程退出 - 代码:', code, '信号:', signal);
  process.exit(code || 0);
});

// 等待 2 秒,然后发送 session/new
setTimeout(() => {
  console.log('\n=== 发送 session/new ===\n');

  const sessionNew = {
    jsonrpc: '2.0',
    id: 1,
    method: 'session/new',
    params: {
      cwd: workingDir,
      mcpServers: [],
    },
  };

  child.stdin.write(JSON.stringify(sessionNew) + '\n');

  // 等待响应后发送 prompt
  setTimeout(() => {
    // 解析 session ID
    const lines = stdoutBuffer.split('\n').filter(l => l.trim());
    const lastLine = lines[lines.length - 1];
    console.log('\n最后一行输出:', lastLine);

    try {
      const response = JSON.parse(lastLine);
      if (response.result && response.result.sessionId) {
        const sessionId = response.result.sessionId;
        console.log('Session ID:', sessionId);

        // 发送 prompt
        console.log('\n=== 发送 session/prompt ===\n');
        const prompt = {
          jsonrpc: '2.0',
          id: 2,
          method: 'session/prompt',
          params: {
            sessionId: sessionId,
            prompt: [{ type: 'text', text: '你好,请回复我' }],
          },
        };

        child.stdin.write(JSON.stringify(prompt) + '\n');

        // 等待 15 秒查看结果
        setTimeout(() => {
          console.log('\n=== 测试完成 ===');
          child.kill();
        }, 15000);
      }
    } catch (e) {
      console.error('解析响应失败:', e.message);
      console.log('完整 STDOUT:', stdoutBuffer);
      console.log('完整 STDERR:', stderrBuffer);
      child.kill();
    }
  }, 3000);
}, 2000);
