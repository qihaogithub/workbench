const http = require('http');
const fs = require('fs');
const path = require('path');

const OPENCODE = 'http://localhost:4096';
const NEXT = 'http://localhost:3000';
const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

function post(url, body, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout,
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
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout ${timeout}ms for ${url}`)); });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Quick Test: Does local sessionId map correctly? ===\n');

  // Create local session
  console.log('[1] Create local session');
  const session = await post(`${NEXT}/api/sessions`, { demoId: 'demo-example' }, 10000);
  const localId = session.parsed?.data?.sessionId;
  console.log(`  Local: ${localId}`);

  // Check .session.json
  const metaPath = path.join(SESSIONS_DIR, localId, '.session.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  console.log(`  opencodeSessionId: ${meta.opencodeSessionId}`);
  console.log(`  demoId: ${meta.demoId}`);

  // Check if opencode session exists
  console.log('\n[2] Verify opencode session exists');
  const ocSessionPath = `${OPENCODE}/session/${meta.opencodeSessionId}`;
  // We can't GET a session directly, but let's try sending a simple message
  console.log(`  Sending message to opencode session: ${meta.opencodeSessionId}`);
  
  const msgRes = await post(`${OPENCODE}/session/${meta.opencodeSessionId}/message`, {
    parts: [{ type: 'text', text: 'say hi' }],
  }, 60000);
  
  console.log(`  Status: ${msgRes.status}`);
  console.log(`  Content-Type: ${msgRes.headers['content-type']}`);
  console.log(`  Raw length: ${msgRes.raw.length}`);
  console.log(`  Raw (first 200): ${msgRes.raw.substring(0, 200)}`);
  
  if (msgRes.parsed?.parts) {
    const textParts = msgRes.parsed.parts.filter(p => p.type === 'text');
    console.log(`  AI reply: ${textParts.map(p => p.text).join('')}`);
  }

  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
