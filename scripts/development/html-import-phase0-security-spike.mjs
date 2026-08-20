import http from "node:http";

const port = Number(process.env.HTML_IMPORT_SPIKE_PORT || 4417);
let networkProbeRequests = 0;

const policy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "script-src-elem 'unsafe-inline'",
  "script-src-attr 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(body);
}

function sandboxDocument() {
  return `<!doctype html>
<html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; frame-src *; worker-src *">
  <title>Untrusted upload</title>
</head><body><div id="inline-ran">inline script pending</div>
<script>
(() => {
  const channelId = "phase0-channel";
  const generation = 1;
  const probes = { origin: self.origin, inlineScriptRan: true };
  document.querySelector("#inline-ran").textContent = "inline script ran";
  try { void parent.document.body; probes.parentDomBlocked = false; } catch { probes.parentDomBlocked = true; }
  try { document.cookie = "sandbox=1"; probes.cookieBlocked = document.cookie === ""; } catch { probes.cookieBlocked = true; }
  try { localStorage.setItem("sandbox", "1"); probes.localStorageBlocked = false; } catch { probes.localStorageBlocked = true; }
  try { eval("1 + 1"); probes.evalBlocked = false; } catch { probes.evalBlocked = true; }
  try { probes.popupBlocked = window.open("about:blank") === null; } catch { probes.popupBlocked = true; }
  probes.topNavigationAttempted = true;
  let workerProbe;
  try {
    const blob = new Blob(["postMessage(1)"], { type: "text/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    workerProbe = new Promise((resolve) => {
      worker.onmessage = () => { worker.terminate(); resolve(false); };
      worker.onerror = () => { worker.terminate(); resolve(true); };
      setTimeout(() => { worker.terminate(); resolve(true); }, 500);
    });
  } catch { workerProbe = Promise.resolve(true); }
  const child = document.createElement("iframe");
  child.src = "/network-probe?via=child-frame";
  document.body.appendChild(child);

  Promise.all([
    fetch("/network-probe?via=fetch").then(() => false, () => true),
    workerProbe,
  ]).then(([fetchBlocked, workerBlocked]) => {
    probes.fetchBlocked = fetchBlocked;
    probes.workerBlocked = workerBlocked;
    probes.microphonePolicyAllowed = document.permissionsPolicy?.allowsFeature?.("microphone")
      ?? document.featurePolicy?.allowsFeature?.("microphone")
      ?? null;
    parent.postMessage({ type: "READY", channelId, generation, probes }, "*");
    parent.postMessage({ type: "APP_ACTION", channelId, generation, action: "delete-project" }, "*");
    parent.postMessage({ type: "READY", channelId: "wrong", generation, probes: {} }, "*");
    parent.postMessage({ type: "CONSOLE_LOG", channelId, generation, message: "x".repeat(6000) }, "*");
    for (let index = 0; index < 20; index += 1) {
      parent.postMessage({ type: "CONSOLE_LOG", channelId, generation, message: "burst-" + index }, "*");
    }
    const topLink = document.createElement("a");
    topLink.target = "_top";
    topLink.href = "https://example.invalid/top";
    topLink.click();
  });
})();
</script></body></html>`;
}

function parentDocument() {
  return `<!doctype html><html><body><h1>HTML import Phase 0 security spike</h1>
<iframe id="sandbox" sandbox="allow-scripts" referrerpolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'" src="/sandbox"></iframe>
<pre id="results">pending</pre>
<script>
(() => {
  const iframe = document.querySelector("#sandbox");
  const accepted = [];
  const rejected = [];
  let readyProbes = null;
  const timestamps = [];
  const allowed = new Set(["READY", "RESIZE", "RUNTIME_ERROR", "CONSOLE_LOG"]);
  function depth(value, level = 0) {
    if (value === null || typeof value !== "object") return level;
    if (level > 4) return level;
    return Math.max(level, ...Object.values(value).map((item) => depth(item, level + 1)));
  }
  window.addEventListener("message", (event) => {
    let reason = "";
    const payload = event.data;
    const serialized = (() => { try { return JSON.stringify(payload); } catch { return ""; } })();
    const now = performance.now();
    while (timestamps.length && timestamps[0] < now - 1000) timestamps.shift();
    if (event.source !== iframe.contentWindow) reason = "source";
    else if (!payload || typeof payload !== "object") reason = "shape";
    else if (payload.channelId !== "phase0-channel" || payload.generation !== 1) reason = "load-identity";
    else if (!allowed.has(payload.type)) reason = "type";
    else if (!serialized || serialized.length > 4096) reason = "size";
    else if (depth(payload) > 4) reason = "depth";
    else if (timestamps.length >= 10) reason = "rate";
    if (reason) rejected.push({ reason, type: payload?.type ?? null });
    else {
      timestamps.push(now);
      accepted.push(payload.type);
      if (payload.type === "READY") readyProbes = payload.probes;
    }
  });
  window.postMessage({ type: "READY", channelId: "phase0-channel", generation: 1 }, "*");
  setTimeout(async () => {
    const probeCount = await fetch("/probe-count").then((response) => response.json());
    const result = {
      accepted,
      rejected,
      probes: readyProbes,
      networkProbeRequests: probeCount.count,
      iframeSandbox: iframe.getAttribute("sandbox"),
      iframeAllow: iframe.getAttribute("allow"),
      referrerPolicy: iframe.referrerPolicy,
      topNavigationBlocked: location.origin === "http://127.0.0.1:${port}",
    };
    document.querySelector("#results").textContent = JSON.stringify(result, null, 2);
    document.documentElement.dataset.spikeComplete = "true";
  }, 1800);
})();
</script></body></html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (url.pathname === "/network-probe") {
    networkProbeRequests += 1;
    send(response, 204, "");
    return;
  }
  if (url.pathname === "/probe-count") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ count: networkProbeRequests }));
    return;
  }
  if (url.pathname === "/sandbox") {
    send(response, 200, sandboxDocument(), {
      "Content-Security-Policy": policy,
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), clipboard-read=(), clipboard-write=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    return;
  }
  send(response, 200, parentDocument(), { "X-Content-Type-Options": "nosniff" });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`HTML import Phase 0 security spike listening at http://127.0.0.1:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
