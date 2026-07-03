import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "packages/author-site/public/preview-runtime");
const viewerOutDir = path.join(repoRoot, "packages/viewer-site/public/preview-runtime");
const vendorDir = path.join(outDir, "vendor");
const tmpDir = path.join(repoRoot, "tmp/preview-runtime-build");

const entries = {
  react: {
    file: "react.js",
    source: `import React from "react"; export default React; export * from "react";`,
  },
  "react-dom": {
    file: "react-dom.js",
    source: `import * as ReactDOM from "react-dom"; export default ReactDOM; export * from "react-dom";`,
  },
  "react-dom/client": {
    file: "react-dom-client.js",
    source: `import * as ReactDOMClient from "react-dom/client"; export default ReactDOMClient; export * from "react-dom/client";`,
  },
  "react/jsx-runtime": {
    file: "react-jsx-runtime.js",
    source: `import runtime from "react/jsx-runtime";
export const Fragment = runtime.Fragment;
export const jsx = runtime.jsx;
export const jsxs = runtime.jsxs;
export default runtime;`,
  },
  "react/jsx-dev-runtime": {
    file: "react-jsx-dev-runtime.js",
    source: `import runtime from "react/jsx-dev-runtime";
export const Fragment = runtime.Fragment;
export const jsxDEV = runtime.jsxDEV;
export default runtime;`,
  },
  "lucide-react": {
    file: "lucide-react.js",
    source: `export * from "lucide-react";`,
  },
  "framer-motion": {
    file: "framer-motion.js",
    source: `export * from "framer-motion";`,
  },
  "svgaplayerweb": {
    file: "svgaplayerweb.js",
    source: `import SVGA from "svgaplayerweb";
export const Parser = SVGA.Parser;
export const Player = SVGA.Player;
export const autoload = SVGA.autoload;
export default SVGA;`,
  },
};

function digest(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function readPackageVersion(packageName) {
  const packageJsonPath = path.join(repoRoot, "node_modules", packageName, "package.json");
  const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
  return pkg.version;
}

async function buildVendorEntries() {
  const entryPoints = [];
  const specifierByEntryPoint = new Map();

  for (const [specifier, entry] of Object.entries(entries)) {
    const entryPath = path.join(tmpDir, entry.file);
    await writeFile(entryPath, entry.source, "utf8");
    entryPoints.push(entryPath);
    specifierByEntryPoint.set(path.resolve(entryPath), specifier);
  }

  const result = await build({
    entryPoints,
    outdir: vendorDir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    splitting: true,
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    sourcemap: false,
    metafile: true,
    logLevel: "silent",
  });

  const builtEntries = {};
  const builtFiles = {};

  for (const [outputPath, meta] of Object.entries(result.metafile.outputs)) {
    const relativeFile = path.relative(vendorDir, outputPath).split(path.sep).join("/");
    const content = await readFile(outputPath, "utf8");
    builtFiles[`vendor/${relativeFile}`] = {
      hash: digest(content),
      bytes: Buffer.byteLength(content),
    };

    if (meta.entryPoint) {
      const specifier = specifierByEntryPoint.get(path.resolve(repoRoot, meta.entryPoint));
      if (specifier) {
        builtEntries[specifier] = `/preview-runtime/vendor/${relativeFile}`;
      }
    }
  }

  return { builtEntries, builtFiles };
}

async function main() {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(vendorDir, { recursive: true });

  const imports = {};
  const files = {};

  const { builtEntries, builtFiles } = await buildVendorEntries();
  Object.assign(imports, builtEntries);
  Object.assign(files, builtFiles);

  imports["@preview/sdk"] = "/preview-runtime/vendor/preview-sdk.js";
  const sdkSource = `
import React from "react";
import * as Lucide from "lucide-react";
import SVGA from "svgaplayerweb";

const semanticIcons = {
  browser: "Globe2", chrome: "Globe2", football: "CircleDot", soccer: "CircleDot",
  trophy: "Trophy", award: "Medal", gift: "Gift", download: "Download",
  mobile: "Smartphone", lock: "Lock", check: "CheckCircle", close: "X",
  info: "Info", share: "Share2", search: "Search", sparkle: "Sparkles",
  loading: "Loader2", clock: "Clock", image: "Image", user: "User",
  calendar: "CalendarDays", chart: "BarChart3"
};
function cx() { return Array.from(arguments).filter(Boolean).join(" "); }
function readRuntimeObject(name) {
  if (typeof window === "undefined") return {};
  const value = window[name];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function Icon(props) {
  const { name = "circle", icon, className, title, ...rest } = props || {};
  const rawName = String(icon || name || "circle");
  const mapped = semanticIcons[rawName] || semanticIcons[rawName.toLowerCase()] || rawName;
  const Component = Lucide[mapped] || Lucide[mapped + "Icon"] || Lucide.Circle;
  return React.createElement(Component, { "aria-hidden": title ? undefined : true, "aria-label": title, className, ...rest });
}
export function Button(props) {
  const { variant = "primary", size = "md", className, children, ...rest } = props || {};
  const variants = { primary: "bg-neutral-950 text-white hover:bg-neutral-800", secondary: "bg-white text-neutral-950 border border-neutral-200 hover:bg-neutral-50", ghost: "bg-transparent text-neutral-950 hover:bg-neutral-100", danger: "bg-red-600 text-white hover:bg-red-700" };
  const sizes = { sm: "h-8 px-3 text-sm rounded-md", md: "h-10 px-4 text-sm rounded-md", lg: "h-12 px-5 text-base rounded-lg" };
  return React.createElement("button", { className: cx("inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50", variants[variant] || variants.primary, sizes[size] || sizes.md, className), ...rest }, children);
}
export function trigger(event, payload) {
  if (typeof window === "undefined") return;
  if (!event || typeof event !== "string") {
    console.warn("@preview/sdk trigger(event, payload) requires a string event");
    return;
  }
  const safePayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  window.parent.postMessage({ type: "APP_ACTION", event, payload: safePayload }, "*");
}
export function PageAction(props) {
  const { event, payload, children, as = "button", onClick, type = "button", ...rest } = props || {};
  const handleClick = (clickEvent) => {
    if (typeof onClick === "function") onClick(clickEvent);
    if (clickEvent.defaultPrevented) return;
    trigger(event, typeof payload === "function" ? payload() : payload);
  };
  return React.createElement(as, { ...rest, type: as === "button" ? type : undefined, onClick: handleClick }, children);
}
export function useAppState() {
  const [state, setState] = React.useState(() => readRuntimeObject("__APP_STATE__"));
  React.useEffect(() => {
    const handler = () => setState(readRuntimeObject("__APP_STATE__"));
    window.addEventListener("PREVIEW_APP_RUNTIME_UPDATE", handler);
    return () => window.removeEventListener("PREVIEW_APP_RUNTIME_UPDATE", handler);
  }, []);
  return state;
}
export function useRouteParams() {
  const [params, setParams] = React.useState(() => readRuntimeObject("__ROUTE_PARAMS__"));
  React.useEffect(() => {
    const handler = () => setParams(readRuntimeObject("__ROUTE_PARAMS__"));
    window.addEventListener("PREVIEW_APP_RUNTIME_UPDATE", handler);
    return () => window.removeEventListener("PREVIEW_APP_RUNTIME_UPDATE", handler);
  }, []);
  return params;
}
export function Card(props) {
  const { className, children, ...rest } = props || {};
  return React.createElement("section", { className: cx("rounded-lg border border-neutral-200 bg-white shadow-sm", className), ...rest }, children);
}
export function Modal(props) {
  const { open = true, title, children, className, ...rest } = props || {};
  if (!open) return null;
  return React.createElement("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4", role: "dialog", "aria-modal": true }, React.createElement("div", { className: cx("w-full max-w-md rounded-lg bg-white p-5 shadow-xl", className), ...rest }, title ? React.createElement("h2", { className: "mb-3 text-lg font-semibold text-neutral-950" }, title) : null, children));
}
export function ImageAsset(props) {
  const { src, alt = "", fallback, className, ...rest } = props || {};
  const [failed, setFailed] = React.useState(false);
  if ((!src || failed) && fallback) return React.createElement("div", { className: cx("flex items-center justify-center bg-neutral-100 text-neutral-500", className), ...rest }, fallback);
  return React.createElement("img", { src, alt, className, loading: "lazy", onError: () => setFailed(true), ...rest });
}
export function SvgaPlayer(props) {
  const { src, className, style, loops = 0, contentMode = "AspectFit", fallback = null, onError, ...rest } = props || {};
  const containerRef = React.useRef(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return undefined;
    let disposed = false;
    let player = null;
    container.innerHTML = "";
    setFailed(false);
    try {
      player = new SVGA.Player(container);
      player.loops = loops;
      if (typeof player.setContentMode === "function") player.setContentMode(contentMode);
      const parser = new SVGA.Parser();
      parser.load(src, (videoItem) => {
        if (disposed || !player) return;
        player.setVideoItem(videoItem);
        player.startAnimation();
      }, (error) => {
        if (disposed) return;
        setFailed(true);
        if (typeof onError === "function") onError(error);
      });
    } catch (error) {
      setFailed(true);
      if (typeof onError === "function") onError(error);
    }
    return () => {
      disposed = true;
      if (player) {
        try {
          player.stopAnimation();
          if (typeof player.clear === "function") player.clear();
        } catch {}
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [src, loops, contentMode, onError]);
  if (!src || failed) return fallback ? React.createElement("div", { className, style, ...rest }, fallback) : null;
  return React.createElement("div", { ref: containerRef, className: cx("overflow-hidden", className), style, ...rest });
}
export const Format = {
  number(value, options) { return new Intl.NumberFormat("zh-CN", options).format(Number(value || 0)); },
  currency(value, currency) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: currency || "CNY" }).format(Number(value || 0)); },
  date(value, options) { return new Intl.DateTimeFormat("zh-CN", options).format(new Date(value)); }
};
export function Countdown(props) {
  const { target, className, expiredText = "已结束", render } = props || {};
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const value = { remaining, days: Math.floor(totalSeconds / 86400), hours: Math.floor((totalSeconds % 86400) / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60, expired: remaining <= 0 };
  if (typeof render === "function") return render(value);
  return React.createElement("span", { className }, value.expired ? expiredText : [value.days > 0 ? value.days + "天" : "", String(value.hours).padStart(2, "0"), String(value.minutes).padStart(2, "0"), String(value.seconds).padStart(2, "0")].filter(Boolean).join(":"));
}
export function Progress(props) {
  const { value = 0, max = 100, className, barClassName, label } = props || {};
  const percent = Math.max(0, Math.min(100, Number(value) / Number(max || 100) * 100));
  return React.createElement("div", { className: cx("w-full", className) }, label ? React.createElement("div", { className: "mb-1 text-sm text-neutral-600" }, label) : null, React.createElement("div", { className: "h-2 w-full overflow-hidden rounded-full bg-neutral-200" }, React.createElement("div", { className: cx("h-full rounded-full bg-neutral-950 transition-all", barClassName), style: { width: percent + "%" } })));
}
export function Motion(props) {
  const { as = "div", children, className, style, delay = 0, ...rest } = props || {};
  return React.createElement(as, { className, style: { transition: "all 240ms ease", transitionDelay: delay + "ms", ...style }, ...rest }, children);
}
export function Chart(props) {
  const { data = [], className, color = "#111827" } = props || {};
  const values = data.map((item) => Number(item.value || item || 0));
  const max = Math.max(1, ...values);
  return React.createElement("svg", { viewBox: "0 0 240 120", className, role: "img" }, values.map((value, index) => {
    const width = 180 / Math.max(1, values.length);
    const height = value / max * 96;
    return React.createElement("rect", { key: index, x: 24 + index * width, y: 108 - height, width: Math.max(4, width - 6), height, rx: 3, fill: color });
  }));
}
export function Confetti(props) {
  const { count = 18, className } = props || {};
  return React.createElement("div", { className: cx("pointer-events-none absolute inset-0 overflow-hidden", className), "aria-hidden": true }, Array.from({ length: count }).map((_, index) => React.createElement("span", { key: index, className: "absolute block h-2 w-2 rounded-sm", style: { left: (index * 37 % 100) + "%", top: (index * 19 % 70) + "%", background: ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"][index % 4], transform: "rotate(" + (index * 29 % 360) + "deg)" } })));
}
export function Lottie(props) {
  const { className, label = "动画" } = props || {};
  return React.createElement("div", { className: cx("flex items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-500", className) }, label);
}
export function MediaViz(props) {
  const { bars = 16, className } = props || {};
  return React.createElement("div", { className: cx("flex h-12 items-end gap-1", className), "aria-hidden": true }, Array.from({ length: bars }).map((_, index) => React.createElement("span", { key: index, className: "w-1 rounded-full bg-current", style: { height: 20 + (index * 17 % 28) + "%" } })));
}
export function Carousel(props) {
  const { items = [], renderItem, className } = props || {};
  const [index, setIndex] = React.useState(0);
  const item = items[index] || null;
  return React.createElement("div", { className: cx("relative", className) }, typeof renderItem === "function" ? renderItem(item, index) : React.createElement("div", null, item == null ? "" : String(item)), items.length > 1 ? React.createElement("div", { className: "mt-3 flex justify-center gap-2" }, items.map((_, dotIndex) => React.createElement("button", { key: dotIndex, type: "button", "aria-label": "切换到第 " + (dotIndex + 1) + " 项", className: dotIndex === index ? "h-2 w-4 rounded-full bg-neutral-950" : "h-2 w-2 rounded-full bg-neutral-300", onClick: () => setIndex(dotIndex) }))) : null);
}
`;
  const sdkPath = path.join(vendorDir, "preview-sdk.js");
  await writeFile(sdkPath, sdkSource.trimStart(), "utf8");
  const sdkContent = await readFile(sdkPath, "utf8");
  files["vendor/preview-sdk.js"] = {
    hash: digest(sdkContent),
    bytes: Buffer.byteLength(sdkContent),
  };

  const manifest = {
    version: "2026-06-preview-runtime-v4",
    generatedAt: new Date().toISOString(),
    imports,
    files,
    packages: {
      react: await readPackageVersion("react"),
      "react-dom": await readPackageVersion("react-dom"),
      "lucide-react": await readPackageVersion("lucide-react"),
      "framer-motion": await readPackageVersion("framer-motion"),
      "svgaplayerweb": await readPackageVersion("svgaplayerweb"),
    },
  };

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rm(viewerOutDir, { recursive: true, force: true });
  await mkdir(path.dirname(viewerOutDir), { recursive: true });
  await cp(outDir, viewerOutDir, { recursive: true });
  await rm(tmpDir, { recursive: true, force: true });
  console.log(`Preview runtime manifest generated at ${path.relative(repoRoot, outDir)} and ${path.relative(repoRoot, viewerOutDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
