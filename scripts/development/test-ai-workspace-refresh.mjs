#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportDir = path.join(repoRoot, 'tmp', 'ai-workspace-refresh-test');
const reportPath = path.join(reportDir, 'report.json');

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listJsonlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        result.push(fullPath);
      }
    }
  };
  walk(dir);
  return result.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

function summarizeRunLog(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line));
  const counts = {};
  const writeResults = [];
  for (const entry of entries) {
    counts[entry.eventType] = (counts[entry.eventType] || 0) + 1;
    if (
      entry.eventType === 'tool_call_update' &&
      entry.payload?.toolName === 'writeFile'
    ) {
      writeResults.push({
        time: entry.timestamp,
        status: entry.payload.status,
        summary: entry.summary,
        path: entry.payload.details?.path,
      });
    }
  }
  const finish = [...entries].reverse().find((entry) => entry.eventType === 'finish');
  return {
    filePath: path.relative(repoRoot, filePath),
    counts,
    finish: finish?.payload,
    recentWriteResults: writeResults.slice(-8),
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

fs.mkdirSync(reportDir, { recursive: true });

const staticChecks = [];
const systemPrompt = readText('packages/author-site/src/lib/agent/prompts/system-prompt.md');
staticChecks.push({
  name: 'system prompt uses workspace-tree.json from workspace root',
  ok: !systemPrompt.includes('workspace/workspace-tree.json'),
});

const editPage = readText('packages/author-site/src/app/demo/[id]/edit/page.tsx');
staticChecks.push({
  name: 'AI file changes under demos trigger workspace refresh',
  ok: editPage.includes('normalizedPath.startsWith("demos/")'),
});

const testRun = run('pnpm', [
  '--filter',
  '@opencode-workbench/agent-service',
  'test',
  '--',
  'tests/unit/pi-agent.test.ts',
  'tests/unit/ws-event-router.test.ts',
]);

const logRoot = path.join(repoRoot, 'data', 'agent-run-logs');
const logFiles = listJsonlFiles(logRoot);
const latestLogs = logFiles.slice(-3).map(summarizeRunLog);

const report = {
  generatedAt: new Date().toISOString(),
  staticChecks,
  testRun: {
    command: testRun.command,
    status: testRun.status,
    stdoutTail: testRun.stdout.split('\n').slice(-80).join('\n'),
    stderrTail: testRun.stderr.split('\n').slice(-80).join('\n'),
  },
  latestRunLogs: latestLogs,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`AI workspace refresh regression report: ${path.relative(repoRoot, reportPath)}`);
for (const check of staticChecks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
}
console.log(`Test command: ${testRun.command}`);
console.log(`Test exit status: ${testRun.status}`);
if (latestLogs.length > 0) {
  console.log('Latest run log summaries:');
  for (const log of latestLogs) {
    console.log(JSON.stringify(log, null, 2));
  }
} else {
  console.log('No JSONL run logs found under data/agent-run-logs.');
}

const staticFailed = staticChecks.some((check) => !check.ok);
if (staticFailed || testRun.status !== 0) {
  process.exit(1);
}
