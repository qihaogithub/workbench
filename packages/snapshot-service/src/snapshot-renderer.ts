import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { transform } from "sucrase";
import { generateIframeHtml } from "@opencode-workbench/shared/demo/iframe-template";

export interface RenderOptions {
  code: string;
  width: number;
  height: number;
  configData?: Record<string, unknown>;
}

let browserInstance: Browser | null = null;

// 编译缓存
const compileCache = new Map<string, { compiledCode: string; cssImports: string[] }>();

function getChromePath(): string {
  const envPath = process.env.CHROME_PATH;
  if (envPath) return envPath;

  const windowsPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
  ];

  for (const p of windowsPaths) {
    if (p) return p;
  }

  return "/usr/bin/google-chrome";
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    const executablePath = getChromePath();
    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browserInstance;
}

const ESM_SH_BASE = "https://esm.sh";
const CORE_VERSIONS: Record<string, string> = {
  react: "18.3.1",
  "react-dom": "18.3.1",
};

/**
 * 轻量编译：sucrase 编译 TSX + CDN URL 重写
 * 复用与 author-site compiler.ts 相同的逻辑
 */
function compileCode(code: string): { compiledCode: string; cssImports: string[] } {
  const cached = compileCache.get(code);
  if (cached) return cached;

  // 自动包装无 export default 的代码
  let wrappedCode = code;
  if (!/\bexport\s+default\b/.test(code)) {
    const componentMatch = code.match(/(?:const|let|var|function)\s+([A-Z]\w*)\s*[=({]/);
    if (code.trim().startsWith("<")) {
      wrappedCode = `export default function __AutoComponent__() {\n  return (\n${code}\n  );\n}`;
    } else if (componentMatch) {
      wrappedCode = `${code}\nexport default ${componentMatch[1]};\n`;
    }
  }

  // sucrase 编译
  const result = transform(wrappedCode, {
    transforms: ["typescript", "jsx"],
    jsxRuntime: "automatic",
    production: true,
  });

  // 提取 import 依赖
  const importRegex = /import\s+(?:(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]|['"]([^'"]+)['"])/g;
  const dependencies: string[] = [];
  let match;
  while ((match = importRegex.exec(result.code)) !== null) {
    const dep = match[1] || match[2];
    if (dep) dependencies.push(dep);
  }

  const cssImports = dependencies.filter((d) => /\.(css|scss|less)$/.test(d));

  // CDN URL 重写
  let compiledCode = result.code;
  for (const dep of dependencies) {
    if (dep.startsWith(".") || dep.startsWith("/") || /\.(css|scss|less)$/.test(dep)) continue;

    let cdnUrl: string;
    const coreVersion = CORE_VERSIONS[dep];
    if (coreVersion) {
      cdnUrl = `${ESM_SH_BASE}/${dep}@${coreVersion}`;
    } else if (dep.startsWith("react/")) {
      cdnUrl = `${ESM_SH_BASE}/react@${CORE_VERSIONS.react}${dep.slice("react".length)}`;
    } else if (dep.startsWith("react-dom/")) {
      cdnUrl = `${ESM_SH_BASE}/react-dom@${CORE_VERSIONS["react-dom"]}${dep.slice("react-dom".length)}`;
    } else {
      cdnUrl = `${ESM_SH_BASE}/${dep}?deps=react@${CORE_VERSIONS.react},react-dom@${CORE_VERSIONS["react-dom"]}`;
    }

    const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    compiledCode = compiledCode.replace(
      new RegExp(`from\\s+(['"])${escaped}\\1`, "g"),
      `from '${cdnUrl}'`,
    );
    compiledCode = compiledCode.replace(
      new RegExp(`import\\s+(['"])${escaped}\\1`, "g"),
      `import '${cdnUrl}'`,
    );
  }

  const compileResult = { compiledCode, cssImports };
  compileCache.set(code, compileResult);
  if (compileCache.size > 100) {
    const firstKey = compileCache.keys().next().value;
    if (firstKey !== undefined) compileCache.delete(firstKey);
  }

  return compileResult;
}

export async function renderPage(options: RenderOptions): Promise<Buffer> {
  const { code, width, height, configData = {} } = options;

  // 1. 编译代码
  const compiled = compileCode(code);

  // 2. 生成 HTML（复用 iframe 模板，含 Tailwind CDN + React CDN）
  const html = generateIframeHtml({
    compiledCode: compiled.compiledCode,
    configData,
    cssImports: compiled.cssImports,
  });

  const browser = await getBrowser();
  const page: Page = await browser.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30000,
    });

    // 等待 React 渲染完成：#root 有子元素
    await page.waitForFunction(
      () => {
        const root = document.getElementById("root");
        return root && root.children.length > 0;
      },
      { timeout: 30000, polling: 100 },
    );

    // 等待所有图片加载完成
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll("img"));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve());
            img.addEventListener("error", () => resolve());
            setTimeout(() => resolve(), 5000);
          });
        }),
      );
    });

    // 等待字体和渲染稳定
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 200));

    const buffer = (await page.screenshot({
      type: "png",
      fullPage: false,
      clip: { x: 0, y: 0, width, height },
    })) as Buffer;

    return buffer;
  } finally {
    await page.close();
  }
}

export async function destroyBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
