#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function numberArg(args, key, fallback) {
  const value = Number(args[key] ?? process.env[`PROTOTYPE_CANVAS_${key.toUpperCase().replace(/-/g, "_")}`]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveUrl(args) {
  if (typeof args.url === "string") return args.url;
  const projectId = args["project-id"] ?? process.env.PROTOTYPE_CANVAS_PROJECT_ID;
  if (!projectId) {
    throw new Error("Missing --url or --project-id");
  }
  const baseUrl = args["base-url"] ?? process.env.PROTOTYPE_CANVAS_BASE_URL ?? "http://localhost:3200";
  return `${String(baseUrl).replace(/\/$/, "")}/demo/${encodeURIComponent(projectId)}/edit`;
}

async function loginIfNeeded(page, targetUrl, args) {
  if (!page.url().includes("/login")) return { attempted: false, ok: true };
  const url = new URL(targetUrl);
  const username = args.user ?? process.env.E2E_USER ?? "qihao";
  const password = args.password ?? process.env.E2E_PASSWORD ?? "130015";
  try {
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(password);
    await Promise.all([
      page.waitForURL((currentUrl) => !currentUrl.pathname.includes("/login"), {
        timeout: 15000,
      }),
      page.getByRole("button", { name: /^登录$/ }).click(),
    ]);
  } catch {
    const response = await page.request.post(`${url.origin}/api/auth/login`, {
      data: { username, password },
    });
    if (!response.ok()) {
      return { attempted: true, ok: false, status: response.status(), body: await response.text() };
    }
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  }
  if (page.url().includes("/login")) {
    return { attempted: true, ok: false, status: "login_redirect", url: page.url() };
  }
  return { attempted: true, ok: true, url: page.url() };
}

async function measureRaf(page, durationMs) {
  return page.evaluate(async (duration) => {
    const frameDeltas = [];
    let last = performance.now();
    const startedAt = last;
    while (performance.now() - startedAt < duration) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frameDeltas.push(now - last);
      last = now;
    }
    const sorted = [...frameDeltas].sort((a, b) => a - b);
    const averageFrameMs = frameDeltas.reduce((sum, value) => sum + value, 0) / Math.max(frameDeltas.length, 1);
    const p95FrameMs = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return {
      frames: frameDeltas.length,
      averageFrameMs,
      p95FrameMs,
      approximateFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
    };
  }, durationMs);
}

async function collectCounts(page) {
  return page.evaluate(() => {
    const memory = performance.memory
      ? {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        }
      : null;
    return {
      canvasPages: document.querySelectorAll("[data-page-id]").length,
      prototypePreviews: document.querySelectorAll("[data-prototype-preview]").length,
      iframes: document.querySelectorAll("iframe").length,
      images: document.querySelectorAll("img").length,
      memory,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetUrl = resolveUrl(args);
  const expectedPages = numberArg(args, "expected-pages", 20);
  const sampleMs = numberArg(args, "sample-ms", 2000);
  const settleMs = numberArg(args, "settle-ms", 0);
  const reportDir = args["report-dir"] ?? process.env.PROTOTYPE_CANVAS_REPORT_DIR ?? "tmp/prototype-canvas-performance";
  const label = args.label ?? process.env.PROTOTYPE_CANVAS_LABEL ?? "current";
  const headless = args.headed ? false : process.env.HEADLESS !== "0";
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const timings = {};

  try {
    const startedAt = Date.now();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    const login = await loginIfNeeded(page, targetUrl, args);
    timings.domContentLoadedMs = Date.now() - startedAt;
    if (!login.ok) throw new Error(`Login failed: ${JSON.stringify(login)}`);

    const canvasButton = page.getByRole("button", { name: /^画布$/ }).first();
    await canvasButton.waitFor({ state: "visible", timeout: 30000 });
    await canvasButton.click();

    const canvasStartedAt = Date.now();
    await page.locator('[data-canvas-root="true"]').waitFor({ state: "visible", timeout: 30000 })
      .catch(async (error) => {
        throw new Error(`${error instanceof Error ? error.message : String(error)}; currentUrl=${page.url()}; title=${await page.title()}`);
      });
    timings.canvasVisibleMs = Date.now() - canvasStartedAt;

    await page.waitForFunction(
      (minPages) => document.querySelectorAll("[data-page-id]").length >= Math.min(minPages, 1),
      expectedPages,
      { timeout: 30000 },
    );
    if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }

    const firstCounts = await collectCounts(page);
    const idleRaf = await measureRaf(page, sampleMs);
    const canvasRoot = page.locator('[data-canvas-root="true"]').first();
    const box = await canvasRoot.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -800);
      await page.mouse.wheel(0, 800);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 + 120, { steps: 20 });
      await page.mouse.up();
    }
    const interactionRaf = await measureRaf(page, sampleMs);
    const finalCounts = await collectCounts(page);

    const report = {
      label,
      targetUrl,
      expectedPages,
      sampledAt: new Date().toISOString(),
      timings,
      counts: { first: firstCounts, final: finalCounts },
      raf: { idle: idleRaf, interaction: interactionRaf },
      notes: [
        "Run the script separately for prototype, screenshot and high-fidelity iframe projects, then compare the JSON reports.",
        "The script measures the current browser/runtime state; it does not create or mutate project data.",
      ],
    };
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${label}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(JSON.stringify({ ok: true, reportPath, report }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
