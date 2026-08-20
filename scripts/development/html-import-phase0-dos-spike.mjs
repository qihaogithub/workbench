import puppeteer from "puppeteer-core";

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const startedAt = Date.now();
let browser;

function bounded(promise, timeoutMs, timeoutValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(timeoutValue), timeoutMs)),
  ]);
}

try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--disable-gpu", "--disable-breakpad", "--disable-crash-reporter", "--noerrdialogs"],
    protocolTimeout: 1500,
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const setContentResult = await bounded(
    page.setContent("<!doctype html><script>while(true){}</script>", { waitUntil: "domcontentloaded", timeout: 750 })
      .then(() => "completed", (error) => `rejected:${error instanceof Error ? error.name : "unknown"}`),
    1500,
    "host-timeout",
  );
  const contextCloseResult = await bounded(
    context.close().then(() => "closed", (error) => `rejected:${error instanceof Error ? error.name : "unknown"}`),
    1500,
    "host-timeout",
  );
  const processHandle = browser.process();
  const requiredProcessKill = contextCloseResult !== "closed";
  if (requiredProcessKill && processHandle) processHandle.kill("SIGKILL");
  if (!requiredProcessKill) await browser.close();
  process.stdout.write(`${JSON.stringify({
    setContentResult,
    contextCloseResult,
    requiredProcessKill,
    elapsedMs: Date.now() - startedAt,
  }, null, 2)}\n`);
} finally {
  if (browser?.connected) browser.process()?.kill("SIGKILL");
}
