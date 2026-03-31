const http = require('http');

const OPENCODE = 'http://localhost:4096';
const NEXT = 'http://localhost:3000';

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 120000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        resolve({ status: res.statusCode, raw, parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 10000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        resolve({ status: res.statusCode, raw, parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('AI Chat Root Cause Test');
  console.log('========================================\n');

  // Step 1: Health
  console.log('[1] Health check');
  const health = await get(`${OPENCODE}/global/health`);
  console.log(`  Status: ${health.status}, Raw: ${health.raw.substring(0, 200)}\n`);

  // Step 2: Create opencode session
  console.log('[2] Create opencode session');
  const ocSession = await post(`${OPENCODE}/session`, { title: 'test' });
  console.log(`  Status: ${ocSession.status}`);
  console.log(`  Raw: ${ocSession.raw.substring(0, 300)}`);
  const ocSessionId = ocSession.parsed?.id;
  console.log(`  Session ID: ${ocSessionId}\n`);

  // Step 3: Send message
  console.log('[3] Send message to opencode session');
  const msgRes = await post(`${OPENCODE}/session/${ocSessionId}/message`, {
    parts: [{ type: 'text', text: 'hi' }],
  });
  console.log(`  Status: ${msgRes.status}`);
  console.log(`  Content-Type: ${msgRes.headers['content-type']}`);
  console.log(`  Raw length: ${msgRes.raw.length}`);
  console.log(`  Raw (first 500): ${msgRes.raw.substring(0, 500)}`);
  if (msgRes.parsed) {
    console.log(`  Parsed keys: ${Object.keys(msgRes.parsed).join(', ')}`);
    if (msgRes.parsed.parts) {
      msgRes.parsed.parts.forEach(p => {
        if (p.type === 'text') console.log(`  AI reply: ${p.text}`);
      });
    }
  }
  console.log();

  // Step 4: Create local session
  console.log('[4] Create local session via Next.js');
  const localSession = await post(`${NEXT}/api/sessions`, { demoId: 'demo-example' });
  console.log(`  Status: ${localSession.status}`);
  console.log(`  Raw: ${localSession.raw.substring(0, 300)}`);
  const localSessionId = localSession.parsed?.data?.sessionId;
  console.log(`  Local Session ID: ${localSessionId}\n`);

  // Step 5: Reproduce bug
  console.log('[5] Reproduce: use local session ID with opencode');
  try {
    const bugRes = await post(`${OPENCODE}/session/${localSessionId}/message`, {
      parts: [{ type: 'text', text: 'test' }],
    });
    console.log(`  Status: ${bugRes.status}`);
    console.log(`  Raw: ${bugRes.raw.substring(0, 300)}`);
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
  console.log();

  // Step 6: Test /api/ai/chat without sessionId
  console.log('[6] Test /api/ai/chat (no sessionId)');
  const chatRes = await post(`${NEXT}/api/ai/chat`, {
    message: 'hi',
    demoId: 'demo-example',
  });
  console.log(`  Status: ${chatRes.status}`);
  console.log(`  Raw: ${chatRes.raw.substring(0, 500)}`);
  if (chatRes.parsed) {
    if (chatRes.parsed.success) {
      console.log(`  sessionId: ${chatRes.parsed.data?.sessionId}`);
      console.log(`  aiReply: ${chatRes.parsed.data?.aiReply}`);
    } else {
      console.log(`  Error: ${chatRes.parsed.error?.message}`);
    }
  }
  console.log();

  // Step 7: Check what /session/{id}/message returns for content-type
  console.log('[7] Check response headers for /session/{id}/message');
  const headerCheck = await post(`${OPENCODE}/session/${ocSessionId}/message`, {
    parts: [{ type: 'text', text: 'hello again' }],
  });
  console.log(`  Content-Type: ${headerCheck.headers['content-type']}`);
  console.log(`  Transfer-Encoding: ${headerCheck.headers['transfer-encoding']}`);
  console.log(`  Connection: ${headerCheck.headers['connection']}`);
  console.log(`  Raw length: ${headerCheck.raw.length}`);
  console.log(`  Is SSE stream: ${headerCheck.headers['content-type']?.includes('text/event-stream')}`);
  console.log();

  console.log('========================================');
  console.log('Done');
  console.log('========================================');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
