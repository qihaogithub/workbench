const http = require('http');

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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 120000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        resolve({ status: res.statusCode, raw, parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Critical Path Test: local sessionId -> opencode sessionId ===\n');

  console.log('[1] Create local session');
  const session = await post(`${NEXT}/api/sessions`, { demoId: 'demo-example' });
  const localId = session.parsed?.data?.sessionId;
  console.log(`  Local sessionId: ${localId}`);
  console.log(`  Has code: ${!!session.parsed?.data?.code}`);
  console.log(`  Has schema: ${!!session.parsed?.data?.schema}`);

  console.log('\n[2] Send AI message WITH local sessionId');
  const chat1 = await post(`${NEXT}/api/ai/chat`, {
    message: 'change the title to "Hello World"',
    sessionId: localId,
    demoId: 'demo-example',
  });
  console.log(`  Status: ${chat1.status}`);
  if (chat1.parsed?.success) {
    console.log(`  Returned sessionId: ${chat1.parsed.data?.sessionId}`);
    console.log(`  AI reply: ${chat1.parsed.data?.aiReply?.substring(0, 100)}`);
    console.log(`  Has updated code: ${!!chat1.parsed.data?.code}`);
    console.log(`  Has updated schema: ${!!chat1.parsed.data?.schema}`);
  } else {
    console.log(`  ERROR: ${chat1.parsed?.error?.message}`);
    console.log(`  Raw: ${chat1.raw?.substring(0, 300)}`);
  }

  console.log('\n[3] Send second AI message (reuse same session)');
  const chat2 = await post(`${NEXT}/api/ai/chat`, {
    message: 'add a description below the title',
    sessionId: localId,
    demoId: 'demo-example',
  });
  if (chat2.parsed?.success) {
    console.log(`  AI reply: ${chat2.parsed.data?.aiReply?.substring(0, 100)}`);
    console.log(`  Has updated code: ${!!chat2.parsed.data?.code}`);
  } else {
    console.log(`  ERROR: ${chat2.parsed?.error?.message}`);
  }

  console.log('\n[4] Save session');
  const saveRes = await post(`${NEXT}/api/sessions/${localId}/save`, {});
  console.log(`  Status: ${saveRes.status}`);
  console.log(`  Success: ${saveRes.parsed?.success}`);

  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
