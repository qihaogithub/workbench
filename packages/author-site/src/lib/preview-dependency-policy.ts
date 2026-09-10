import { getCdnBaseUrl } from "./cdn-config";
import {
  type PreviewRuntimeResolveOptions,
  getPreviewRuntimeUrl,
} from "./preview-runtime-manifest";
import {
  PREVIEW_CONTRACT_VERSION,
  PREVIEW_DEPENDENCY_POLICY,
  PreviewRuntimeContractError,
  assertPreviewRuntimeContract,
  isNpmPackage,
  validatePreviewPageSource,
  type ImportDeclaration,
  type PreviewDependencyDefinition,
  type PreviewDependencyKind,
  type RuntimeContractIssue,
  type RuntimeContractValidation,
} from "@workbench/preview-contract/runtime";

export {
  PREVIEW_DEPENDENCY_POLICY,
  PreviewRuntimeContractError,
  assertPreviewRuntimeContract,
  isNpmPackage,
  type ImportDeclaration,
  type PreviewDependencyDefinition,
  type PreviewDependencyKind,
  type RuntimeContractIssue,
  type RuntimeContractValidation,
};

export const PREVIEW_DEPENDENCY_POLICY_VERSION = PREVIEW_CONTRACT_VERSION;
export const validatePreviewRuntimeContract = validatePreviewPageSource;

const ESM_SH_BASE = getCdnBaseUrl();

function getPolicyPackageName(moduleName: string): string {
  if (moduleName === "react" || moduleName.startsWith("react/")) return "react";
  if (moduleName === "react-dom" || moduleName.startsWith("react-dom/"))
    return "react-dom";
  return moduleName;
}

function buildCdnPackageUrl(packageName: string): string {
  const policyName = getPolicyPackageName(packageName);
  const dependency = PREVIEW_DEPENDENCY_POLICY[policyName];
  if (!dependency) {
    throw new PreviewRuntimeContractError([
      {
        stage: "dependency_import",
        code: "UNKNOWN_NPM_IMPORT",
        severity: "error",
        moduleName: packageName,
        message: `预览运行时未登记依赖 ${packageName}`,
        instruction:
          "请改用 @preview/sdk 暴露的受控能力，或由开发团队先将该依赖加入 previewDependencyPolicy。",
      },
    ]);
  }

  if (packageName.startsWith("react/")) {
    return `${ESM_SH_BASE}/react@${dependency.version}${packageName.slice("react".length)}`;
  }
  if (packageName.startsWith("react-dom/")) {
    return `${ESM_SH_BASE}/react-dom@${dependency.version}${packageName.slice("react-dom".length)}`;
  }
  if (packageName === "framer-motion") {
    const reactVer = PREVIEW_DEPENDENCY_POLICY.react.version;
    const reactDomVer = PREVIEW_DEPENDENCY_POLICY["react-dom"].version;
    return `${ESM_SH_BASE}/framer-motion@${dependency.version}?deps=react@${reactVer},react-dom@${reactDomVer}`;
  }
  if (packageName === "lucide-react") {
    const reactVer = PREVIEW_DEPENDENCY_POLICY.react.version;
    const reactDomVer = PREVIEW_DEPENDENCY_POLICY["react-dom"].version;
    return `${ESM_SH_BASE}/lucide-react@${dependency.version}?deps=react@${reactVer},react-dom@${reactDomVer}`;
  }

  return `${ESM_SH_BASE}/${packageName}@${dependency.version}`;
}

function buildLocalPackageUrl(
  packageName: string,
  options: PreviewRuntimeResolveOptions = {},
): string | null {
  const directUrl = getPreviewRuntimeUrl(packageName, options);
  if (directUrl) return directUrl;

  if (packageName.startsWith("react/")) {
    return getPreviewRuntimeUrl(packageName, options);
  }
  if (packageName.startsWith("react-dom/")) {
    return getPreviewRuntimeUrl(packageName, options);
  }

  return null;
}

function createPreviewSdkSource(
  options: PreviewRuntimeResolveOptions = {},
): string {
  const reactUrl = getPreviewDependencyUrl("react", options);
  const lucideUrl = getPreviewDependencyUrl("lucide-react", options);
  const svgaUrl = getPreviewDependencyUrl("svgaplayerweb", options);

  return `
import React from '${reactUrl}';
import * as Lucide from '${lucideUrl}';
import SVGA from '${svgaUrl}';

const semanticIcons = {
  browser: 'Globe2',
  chrome: 'Globe2',
  football: 'CircleDot',
  soccer: 'CircleDot',
  trophy: 'Trophy',
  award: 'Medal',
  gift: 'Gift',
  download: 'Download',
  mobile: 'Smartphone',
  lock: 'Lock',
  check: 'CheckCircle',
  close: 'X',
  info: 'Info',
  share: 'Share2',
  search: 'Search',
  sparkle: 'Sparkles',
  loading: 'Loader2',
  clock: 'Clock',
  image: 'Image',
  user: 'User',
  calendar: 'CalendarDays',
  chart: 'BarChart3'
};

function cx() {
  return Array.from(arguments).filter(Boolean).join(' ');
}

// Realm-local, connection-local preview probes.  The WeakMap intentionally
// keeps the registry private to this SDK realm; the stable
// element.__workbenchPreviewProbe__ property is only a narrow host bridge
// and never exposes user code, textures, or raw assets.
const previewProbeRegistry = new WeakMap();
function safeProbeBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x), y = Number(value.y), width = Number(value.width), height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) return null;
  if (Math.abs(x) > 100000 || Math.abs(y) > 100000 || width > 10000 || height > 10000) return null;
  return { x, y, width, height };
}
function safeProbeNumber(value, max = 100000) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= max ? number : undefined;
}
function sanitizePreviewProbeSnapshot(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'spine') return null;
  const canvas = value.canvas && typeof value.canvas === 'object' ? value.canvas : null;
  const cssWidth = safeProbeNumber(canvas && canvas.cssWidth, 10000);
  const cssHeight = safeProbeNumber(canvas && canvas.cssHeight, 10000);
  const backingWidth = safeProbeNumber(canvas && canvas.backingWidth, 10000);
  const backingHeight = safeProbeNumber(canvas && canvas.backingHeight, 10000);
  if (![cssWidth, cssHeight, backingWidth, backingHeight].every((number) => number !== undefined && number >= 0)) return null;
  const result = {
    kind: 'spine', ready: value.ready === true,
    fit: value.fit === 'cover' || value.fit === 'none' ? value.fit : 'contain',
    alignment: typeof value.alignment === 'string' ? value.alignment : 'center',
    canvas: { cssWidth, cssHeight, backingWidth, backingHeight },
    sampledAt: Number.isFinite(Number(value.sampledAt)) ? Number(value.sampledAt) : Date.now(),
    precision: value.precision === 'painted-bounds' ? 'painted-bounds' : 'runtime-self-reported',
  };
  const skeletonBounds = safeProbeBounds(value.skeletonBounds);
  if (skeletonBounds) result.skeletonBounds = skeletonBounds;
  const paintedBounds = safeProbeBounds(value.paintedBounds);
  if (paintedBounds) result.paintedBounds = paintedBounds;
  if (value.camera && typeof value.camera === 'object') {
    const x = safeProbeNumber(value.camera.x), y = safeProbeNumber(value.camera.y), zoom = safeProbeNumber(value.camera.zoom, 10000);
    const viewportWidth = safeProbeNumber(value.camera.viewportWidth, 10000);
    const viewportHeight = safeProbeNumber(value.camera.viewportHeight, 10000);
    if (x !== undefined && y !== undefined && zoom !== undefined && zoom > 0 && viewportWidth !== undefined && viewportWidth >= 0 && viewportHeight !== undefined && viewportHeight >= 0) {
      result.camera = { x, y, zoom, viewportWidth, viewportHeight };
    }
  }
  const animationName = typeof value.animationName === 'string' ? value.animationName.slice(0, 256) : undefined;
  const trackTime = safeProbeNumber(value.trackTime, 100000);
  const duration = safeProbeNumber(value.duration, 100000);
  if (animationName !== undefined) result.animationName = animationName;
  if (typeof value.animationPlaying === 'boolean') result.animationPlaying = value.animationPlaying;
  if (typeof value.loopEnabled === 'boolean') result.loopEnabled = value.loopEnabled;
  if (trackTime !== undefined) result.trackTime = trackTime;
  if (duration !== undefined) result.duration = duration;
  return result;
}
const previewProbeBridge = {
  register(target, inspector) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function') || typeof inspector !== 'function') return () => {};
    const entry = { inspector };
    previewProbeRegistry.set(target, entry);
    const bridge = { inspect: () => previewProbeBridge.inspect(target) };
    try { target.__workbenchPreviewProbe__ = bridge; } catch (e) {}
    return () => {
      if (previewProbeRegistry.get(target) !== entry) return;
      previewProbeRegistry.delete(target);
      try { if (target.__workbenchPreviewProbe__ === bridge) delete target.__workbenchPreviewProbe__; } catch (e) {}
    };
  },
  unregister(target) {
    const entry = previewProbeRegistry.get(target);
    if (!entry) return;
    previewProbeRegistry.delete(target);
    try { delete target.__workbenchPreviewProbe__; } catch (e) {}
  },
  inspect(target) {
    const entry = target && previewProbeRegistry.get(target);
    if (!entry) return null;
    try { return sanitizePreviewProbeSnapshot(entry.inspector()); } catch (e) { return null; }
  },
};
if (typeof window !== 'undefined') {
  window.__WORKBENCH_PREVIEW_PROBES__ = previewProbeBridge;
}

export function Icon(props) {
  const { name = 'circle', icon, className, title, ...rest } = props || {};
  const rawName = String(icon || name || 'circle');
  const mapped = semanticIcons[rawName] || semanticIcons[rawName.toLowerCase()] || rawName;
  const Component = Lucide[mapped] || Lucide[mapped + 'Icon'] || Lucide.Circle;
  return React.createElement(Component, {
    'aria-hidden': title ? undefined : true,
    'aria-label': title,
    className,
    ...rest
  });
}

export function Button(props) {
  const { variant = 'primary', size = 'md', className, children, ...rest } = props || {};
  const base = 'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    primary: 'bg-neutral-950 text-white hover:bg-neutral-800',
    secondary: 'bg-white text-neutral-950 border border-neutral-200 hover:bg-neutral-50',
    ghost: 'bg-transparent text-neutral-950 hover:bg-neutral-100',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  };
  const sizes = {
    sm: 'h-8 px-3 text-sm rounded-md',
    md: 'h-10 px-4 text-sm rounded-md',
    lg: 'h-12 px-5 text-base rounded-lg'
  };
  return React.createElement('button', {
    className: cx(base, variants[variant] || variants.primary, sizes[size] || sizes.md, className),
    ...rest
  }, children);
}

function readRuntimeObject(name) {
  if (typeof window === 'undefined') return {};
  const value = window[name];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function trigger(event, payload) {
  if (typeof window === 'undefined') return;
  if (!event || typeof event !== 'string') {
    console.warn('@preview/sdk trigger(event, payload) requires a string event');
    return;
  }
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  window.parent.postMessage({ type: 'APP_ACTION', event, payload: safePayload }, '*');
}

export function PageAction(props) {
  const { event, payload, children, as = 'button', onClick, type = 'button', ...rest } = props || {};
  const handleClick = (clickEvent) => {
    if (typeof onClick === 'function') onClick(clickEvent);
    if (clickEvent.defaultPrevented) return;
    trigger(event, typeof payload === 'function' ? payload() : payload);
  };
  return React.createElement(as, {
    ...rest,
    type: as === 'button' ? type : undefined,
    onClick: handleClick
  }, children);
}

export function useAppState() {
  const [state, setState] = React.useState(() => readRuntimeObject('__APP_STATE__'));
  React.useEffect(() => {
    const handler = () => setState(readRuntimeObject('__APP_STATE__'));
    window.addEventListener('PREVIEW_APP_RUNTIME_UPDATE', handler);
    return () => window.removeEventListener('PREVIEW_APP_RUNTIME_UPDATE', handler);
  }, []);
  return state;
}

export function useRouteParams() {
  const [params, setParams] = React.useState(() => readRuntimeObject('__ROUTE_PARAMS__'));
  React.useEffect(() => {
    const handler = () => setParams(readRuntimeObject('__ROUTE_PARAMS__'));
    window.addEventListener('PREVIEW_APP_RUNTIME_UPDATE', handler);
    return () => window.removeEventListener('PREVIEW_APP_RUNTIME_UPDATE', handler);
  }, []);
  return params;
}

export function Card(props) {
  const { className, children, ...rest } = props || {};
  return React.createElement('section', {
    className: cx('rounded-lg border border-neutral-200 bg-white shadow-sm', className),
    ...rest
  }, children);
}

export function Modal(props) {
  const { open = true, title, children, className, ...rest } = props || {};
  if (!open) return null;
  return React.createElement('div', {
    className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4',
    role: 'dialog',
    'aria-modal': true
  }, React.createElement('div', {
    className: cx('w-full max-w-md rounded-lg bg-white p-5 shadow-xl', className),
    ...rest
  }, title ? React.createElement('h2', { className: 'mb-3 text-lg font-semibold text-neutral-950' }, title) : null, children));
}

export function ImageAsset(props) {
  const { src, alt = '', fallback, className, ...rest } = props || {};
  const [failed, setFailed] = React.useState(false);
  if ((!src || failed) && fallback) {
    return React.createElement('div', {
      className: cx('flex items-center justify-center bg-neutral-100 text-neutral-500', className),
      ...rest
    }, fallback);
  }
  return React.createElement('img', {
    src,
    alt,
    className,
    loading: 'lazy',
    onError: () => setFailed(true),
    ...rest
  });
}

export function SvgaPlayer(props) {
  const {
    src,
    className,
    style,
    loops = 0,
    contentMode = 'AspectFit',
    fallback = null,
    onError,
    ...rest
  } = props || {};
  const containerRef = React.useRef(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return undefined;

    let disposed = false;
    let player = null;
    container.innerHTML = '';
    setFailed(false);

    try {
      player = new SVGA.Player(container);
      player.loops = loops;
      if (typeof player.setContentMode === 'function') {
        player.setContentMode(contentMode);
      }
      const parser = new SVGA.Parser();
      parser.load(
        src,
        (videoItem) => {
          if (disposed || !player) return;
          player.setVideoItem(videoItem);
          player.startAnimation();
        },
        (error) => {
          if (disposed) return;
          setFailed(true);
          if (typeof onError === 'function') onError(error);
        },
      );
    } catch (error) {
      setFailed(true);
      if (typeof onError === 'function') onError(error);
    }

    return () => {
      disposed = true;
      if (player) {
        try {
          player.stopAnimation();
          if (typeof player.clear === 'function') player.clear();
        } catch {}
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [src, loops, contentMode, onError]);

  if (!src || failed) {
    return fallback ? React.createElement('div', { className, style, ...rest }, fallback) : null;
  }

  return React.createElement('div', {
    ref: containerRef,
    className: cx('overflow-hidden', className),
    style,
    ...rest
  });
}

export const Format = {
  number(value, options) {
    return new Intl.NumberFormat('zh-CN', options).format(Number(value || 0));
  },
  currency(value, currency) {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency || 'CNY' }).format(Number(value || 0));
  },
  date(value, options) {
    return new Intl.DateTimeFormat('zh-CN', options).format(new Date(value));
  }
};

export function Countdown(props) {
  const { target, className, expiredText = '已结束', render } = props || {};
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = { remaining, days, hours, minutes, seconds, expired: remaining <= 0 };
  if (typeof render === 'function') return render(value);
  return React.createElement('span', { className }, value.expired ? expiredText : [days > 0 ? days + '天' : '', String(hours).padStart(2, '0'), String(minutes).padStart(2, '0'), String(seconds).padStart(2, '0')].filter(Boolean).join(':'));
}

export function Progress(props) {
  const { value = 0, max = 100, className, barClassName, label } = props || {};
  const percent = Math.max(0, Math.min(100, Number(value) / Number(max || 100) * 100));
  return React.createElement('div', { className: cx('w-full', className) },
    label ? React.createElement('div', { className: 'mb-1 text-sm text-neutral-600' }, label) : null,
    React.createElement('div', { className: 'h-2 w-full overflow-hidden rounded-full bg-neutral-200' },
      React.createElement('div', { className: cx('h-full rounded-full bg-neutral-950 transition-all', barClassName), style: { width: percent + '%' } })
    )
  );
}

export function Motion(props) {
  const { as = 'div', children, className, style, delay = 0, ...rest } = props || {};
  return React.createElement(as, {
    className,
    style: { transition: 'all 240ms ease', transitionDelay: delay + 'ms', ...style },
    ...rest
  }, children);
}

export function Chart(props) {
  const { data = [], className, color = '#111827' } = props || {};
  const values = data.map((item) => Number(item.value || item || 0));
  const max = Math.max(1, ...values);
  return React.createElement('svg', { viewBox: '0 0 240 120', className, role: 'img' },
    values.map((value, index) => {
      const width = 180 / Math.max(1, values.length);
      const height = value / max * 96;
      return React.createElement('rect', {
        key: index,
        x: 24 + index * width,
        y: 108 - height,
        width: Math.max(4, width - 6),
        height,
        rx: 3,
        fill: color
      });
    })
  );
}

export function Confetti(props) {
  const { count = 18, className } = props || {};
  return React.createElement('div', { className: cx('pointer-events-none absolute inset-0 overflow-hidden', className), 'aria-hidden': true },
    Array.from({ length: count }).map((_, index) => React.createElement('span', {
      key: index,
      className: 'absolute block h-2 w-2 rounded-sm',
      style: {
        left: (index * 37 % 100) + '%',
        top: (index * 19 % 70) + '%',
        background: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'][index % 4],
        transform: 'rotate(' + (index * 29 % 360) + 'deg)'
      }
    }))
  );
}

export function LottiePlayer(props) {
  const { src, loop = true, autoplay = true, renderer = 'svg', fallback = null, onError, className, style, ...rest } = props || {};
  const containerRef = React.useRef(null);
  const [failed, setFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return undefined;

    let disposed = false;
    let animation = null;
    container.innerHTML = '';
    setFailed(false);
    setReady(false);

    import('lottie-web').then((mod) => {
      if (disposed) return;
      const L = mod.default || mod;
      try {
        animation = L.loadAnimation({
          container,
          path: src,
          renderer,
          loop,
          autoplay,
        });
        setReady(true);
      } catch (e) {
        if (!disposed) {
          setFailed(true);
          if (onError) onError(e);
        }
      }
    }).catch((e) => {
      if (!disposed) {
        setFailed(true);
        if (onError) onError(e);
      }
    });

    return () => {
      disposed = true;
      if (animation) {
        try { animation.destroy(); } catch (e) {}
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [src, loop, autoplay, renderer, onError]);

  if (!src || failed) {
    return fallback ? React.createElement('div', { className: cx('flex items-center justify-center overflow-hidden', className), style, ...rest }, fallback) : null;
  }
  return React.createElement('div', { ref: containerRef, className: cx('overflow-hidden', className), style, ...rest });
}

export function RivePlayer(props) {
  const { src, fit = 'cover', alignment = 'center', autoplay = true, fallback = null, onError, className, style, ...rest } = props || {};
  const containerRef = React.useRef(null);
  const riveRef = React.useRef(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return undefined;

    let disposed = false;
    let riveInstance = null;
    container.innerHTML = '';
    setFailed(false);

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const ro = new ResizeObserver(() => {
      if (riveRef.current) {
        try { riveRef.current.resizeDrawingSurfaceToCanvas(); } catch (e) {}
      }
    });
    ro.observe(container);

    import('@rive-app/canvas').then((mod) => {
      if (disposed) return;
      const R = mod.default || mod;
      try {
        riveInstance = new R({
          src,
          canvas,
          autoplay,
          locateFile: (f) => '/preview-runtime/vendor/' + f,
        });
        if (riveInstance && R.Fit && R.Alignment) {
          if (typeof riveInstance.setFit === 'function') riveInstance.setFit(R.Fit[fit] || R.Fit.cover);
          if (typeof riveInstance.setAlignment === 'function') riveInstance.setAlignment(R.Alignment[alignment] || R.Alignment.center);
        }
        riveRef.current = riveInstance;
      } catch (e) {
        if (!disposed) {
          setFailed(true);
          if (onError) onError(e);
        }
      }
    }).catch((e) => {
      if (!disposed) {
        setFailed(true);
        if (onError) onError(e);
      }
    });

    return () => {
      disposed = true;
      ro.disconnect();
      if (riveRef.current) {
        try { riveRef.current.cleanup(); } catch (e) {}
      }
      riveRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [src, fit, alignment, autoplay, onError]);

  if (!src || failed) {
    return fallback ? React.createElement('div', { className: cx('flex items-center justify-center overflow-hidden', className), style, ...rest }, fallback) : null;
  }
  return React.createElement('div', { ref: containerRef, className: cx('overflow-hidden', className), style, ...rest });
}

export function SpinePlayer(props) {
  const { src, animation, loop = true, audioEnabled = true, fit = 'contain', alignment = 'center', fallback, onError, className, style, ...rest } = props || {};
  const containerRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [failed, setFailed] = React.useState(false);
  const [hasAudio, setHasAudio] = React.useState(false);
  const [audioMuted, setAudioMuted] = React.useState(!audioEnabled);
  const audioMutedRef = React.useRef(!audioEnabled);
  const unlockAudioRef = React.useRef(() => {});
  const hasSrc = !!src;

  React.useEffect(() => {
    const muted = !audioEnabled;
    audioMutedRef.current = muted;
    setAudioMuted(muted);
  }, [audioEnabled]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasSrc) return undefined;

    let disposed = false;
    let gl = null;
    let sceneRenderer = null;
    let skeletonObj = null;
    let state = null;
    let physicsMode = null;
    let animFrame = null;
    let lastTime = 0;
    let assetManager = null;
    let audioContext = null;
    let audioUnlocked = false;
    let audioGestureObserved = false;
    let spineProbeUnregister = null;
    const audioBufferCache = new Map();
    const activeAudioSources = new Set();
    let spineFit = fit;
    let spineAlignment = alignment;
    container.innerHTML = '';
    setFailed(false);

    function fail(stage, error) {
      if (disposed) return;
      let message = 'Unknown Spine runtime error';
      if (error instanceof Error) message = error.message;
      else if (typeof error === 'string') message = error;
      else {
        try { message = JSON.stringify(error); } catch (ignored) { message = String(error); }
      }
      console.error('[SpinePlayer]', stage, message);
      setFailed(true);
      if (onError) onError(error instanceof Error ? error : new Error(message));
    }

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    function readSpineBounds() {
      if (!skeletonObj) return null;
      const offset = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
      const size = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
      try { skeletonObj.getBounds(offset, size); } catch (e) { return null; }
      return safeProbeBounds({ x: offset.x, y: offset.y, width: size.x, height: size.y });
    }
    function readProjectedPaintedBounds(bounds, camera, width, height, originX = 0, originY = 0) {
      if (!bounds || !camera || !(camera.zoom > 0) || !(width > 0) || !(height > 0)) return null;
      const left = width / 2 + (bounds.x - camera.x) / camera.zoom;
      const right = width / 2 + (bounds.x + bounds.width - camera.x) / camera.zoom;
      const top = height / 2 - (bounds.y + bounds.height - camera.y) / camera.zoom;
      const bottom = height / 2 - (bounds.y - camera.y) / camera.zoom;
      return safeProbeBounds({ x: left + originX, y: top + originY, width: right - left, height: bottom - top });
    }
    function snapshotSpineProbe() {
      const cssWidth = canvas.clientWidth || canvas.width || 0;
      const cssHeight = canvas.clientHeight || canvas.height || 0;
      const canvasRect = canvas.getBoundingClientRect();
      const camera = sceneRenderer && sceneRenderer.camera
        ? { x: Number(sceneRenderer.camera.position.x), y: Number(sceneRenderer.camera.position.y), zoom: Number(sceneRenderer.camera.zoom), viewportWidth: cssWidth, viewportHeight: cssHeight }
        : undefined;
      const skeletonBounds = readSpineBounds();
      const animationEntry = state && state.tracks && state.tracks[0];
      return {
        kind: 'spine', ready: !!(sceneRenderer && skeletonObj && state),
        animationName: animationEntry && animationEntry.animation && typeof animationEntry.animation.name === 'string' ? animationEntry.animation.name : undefined,
        animationPlaying: animationEntry ? animationEntry.isComplete !== true : undefined,
        loopEnabled: animationEntry ? animationEntry.loop === true : undefined,
        trackTime: animationEntry ? Number(animationEntry.trackTime) : undefined,
        duration: animationEntry && animationEntry.animation ? Number(animationEntry.animation.duration) : undefined,
        skeletonBounds, camera,
        fit: normalizeSpineFit(spineFit), alignment: normalizeSpineAlignment(spineAlignment),
        canvas: { cssWidth, cssHeight, backingWidth: canvas.width || 0, backingHeight: canvas.height || 0 },
        paintedBounds: readProjectedPaintedBounds(skeletonBounds, camera, cssWidth, cssHeight, Number(canvasRect.x) || 0, Number(canvasRect.y) || 0),
        sampledAt: Date.now(), precision: 'painted-bounds',
      };
    }
    spineProbeUnregister = previewProbeBridge.register(canvas, snapshotSpineProbe);

    function unlockAudio() {
      audioGestureObserved = true;
      if (!audioEnabled || !audioContext || audioUnlocked) return;
      audioContext.resume().then(() => { audioUnlocked = audioContext.state === 'running'; }).catch(() => {});
    }
    unlockAudioRef.current = unlockAudio;
    const unlockEvents = ['pointerdown', 'touchstart', 'keydown'];
    unlockEvents.forEach((eventName) => window.addEventListener(eventName, unlockAudio, { passive: true }));

    function normalizedAudioKey(value) {
      return String(value || '').replaceAll('\\\\', '/').replace(/^\.\//, '').toLowerCase();
    }
    function resolveAudio(asset, audioPath) {
      const requested = normalizedAudioKey(audioPath);
      const files = Array.isArray(asset.manifest.audio) ? asset.manifest.audio : (asset.manifest.files || [])
        .filter((file) => /\.(mp3|ogg|wav|m4a)$/i.test(file.path))
        .map((file) => ({ ...file, keys: [file.path, './' + file.path, file.path.replace(/\.(mp3|ogg|wav|m4a)$/i, ''), file.path.split('/').pop(), file.path.split('/').pop().replace(/\.(mp3|ogg|wav|m4a)$/i, '')] }));
      return files.find((file) => (file.keys || []).some((key) => normalizedAudioKey(key) === requested)) || null;
    }
    function playAudio(asset, audioPath) {
      if (!audioEnabled || audioMutedRef.current || !audioUnlocked || !audioContext || !audioPath) return;
      const audio = resolveAudio(asset, audioPath);
      if (!audio) return;
      const url = asset.base + audio.path;
      const load = audioBufferCache.get(url) || fetch(url, { credentials: 'same-origin' })
        .then((response) => { if (!response.ok) throw new Error('Spine audio unavailable'); return response.arrayBuffer(); })
        .then((data) => audioContext.decodeAudioData(data.slice(0)));
      audioBufferCache.set(url, load);
      load.then((buffer) => {
        if (disposed || audioMutedRef.current || !audioUnlocked || !audioContext) return;
        const source = audioContext.createBufferSource();
        const gain = audioContext.createGain();
        source.buffer = buffer;
        gain.gain.value = 1;
        source.connect(gain).connect(audioContext.destination);
        activeAudioSources.add(source);
        source.onended = () => activeAudioSources.delete(source);
        source.start(0);
      }).catch(() => {});
    }

    // Keep this framing math in sync with src/lib/spine-camera-framing.ts.
    // The preview SDK is generated from this template, so it cannot import
    // the author-site module at runtime.
    function normalizeSpineFit(value) {
      return value === 'contain' || value === 'cover' || value === 'none' ? value : 'contain';
    }
    function normalizeSpineAlignment(value) {
      return value === 'top-left' || value === 'top' || value === 'top-right' || value === 'left' || value === 'center' || value === 'right' || value === 'bottom-left' || value === 'bottom' || value === 'bottom-right' ? value : 'center';
    }
    function frameSpineCamera() {
      if (!sceneRenderer || !skeletonObj || normalizeSpineFit(spineFit) === 'none') return;
      const viewportWidth = canvas.clientWidth || canvas.width || 300;
      const viewportHeight = canvas.clientHeight || canvas.height || 300;
      if (!(viewportWidth > 0) || !(viewportHeight > 0)) return;
      const offset = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
      const size = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
      try { skeletonObj.getBounds(offset, size); } catch (e) { return; }
      if (![offset.x, offset.y, size.x, size.y].every(Number.isFinite) || !(size.x > 0) || !(size.y > 0)) return;
      const normalizedFit = normalizeSpineFit(spineFit);
      const zoom = normalizedFit === 'cover'
        ? Math.min(size.x / viewportWidth, size.y / viewportHeight)
        : Math.max(size.x / viewportWidth, size.y / viewportHeight);
      if (!(Number.isFinite(zoom) && zoom > 0)) return;
      const visibleWidth = viewportWidth * zoom;
      const visibleHeight = viewportHeight * zoom;
      const normalizedAlignment = normalizeSpineAlignment(spineAlignment);
      const horizontal = normalizedAlignment.indexOf('left') !== -1 ? 'left' : normalizedAlignment.indexOf('right') !== -1 ? 'right' : 'center';
      const vertical = normalizedAlignment.indexOf('top') !== -1 ? 'top' : normalizedAlignment.indexOf('bottom') !== -1 ? 'bottom' : 'center';
      const camera = sceneRenderer.camera;
      camera.zoom = zoom;
      camera.position.x = horizontal === 'left'
        ? offset.x + visibleWidth / 2
        : horizontal === 'right'
          ? offset.x + size.x - visibleWidth / 2
          : offset.x + size.x / 2;
      camera.position.y = vertical === 'bottom'
        ? offset.y + visibleHeight / 2
        : vertical === 'top'
          ? offset.y + size.y - visibleHeight / 2
          : offset.y + size.y / 2;
    }

    function render() {
      if (!gl || !sceneRenderer || !skeletonObj || !state) return;
      const w = canvas.clientWidth || canvas.width || 300;
      const h = canvas.clientHeight || canvas.height || 300;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h; sceneRenderer.camera.setViewport(w, h); frameSpineCamera();
      }
      const now = Date.now() / 1000;
      const delta = lastTime ? now - lastTime : 0;
      lastTime = now;
      if (delta > 0 && delta < 1) {
        state.update(delta);
        state.apply(skeletonObj);
        skeletonObj.updateWorldTransform(physicsMode);
      }
      sceneRenderer.begin();
      sceneRenderer.drawSkeleton(skeletonObj);
      sceneRenderer.end();
      animFrame = requestAnimationFrame(render);
    }

    function importRuntime(version) {
      const is42 = typeof version === 'string' && version.indexOf('4.2') === 0;
      return is42 ? import('@esotericsoftware/spine-webgl-42') : import('@esotericsoftware/spine-webgl');
    }

    function sniffVersion(buf, binary) {
      try {
        const bytes = new Uint8Array(buf);
        if (binary && bytes.length > 9) {
          const len = bytes[8];
          if (len > 0 && len < 64) return new TextDecoder().decode(bytes.subarray(9, 9 + len));
        }
        if (!binary && buf.byteLength > 0) {
          const obj = JSON.parse(new TextDecoder().decode(buf));
          if (obj && obj.skeleton && typeof obj.skeleton.spine === 'string') return obj.skeleton.spine;
        }
      } catch (e) {}
      return null;
    }

    function onLoaded(Spine, rawSkeleton, asset, binary) {
      if (disposed || !gl) return;
      try {
        const atlasData = assetManager.get(asset.atlas);
        const loader = new Spine.AtlasAttachmentLoader(atlasData);
        const skeletonData = binary
          ? new Spine.SkeletonBinary(loader).readSkeletonData(rawSkeleton)
          : new Spine.SkeletonJson(loader).readSkeletonData(new TextDecoder().decode(rawSkeleton));
        skeletonObj = new Spine.Skeleton(skeletonData);
        physicsMode = Spine.Physics.update;
        const stateData = new Spine.AnimationStateData(skeletonData);
        state = new Spine.AnimationState(stateData);
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (audioEnabled && AudioContextCtor) {
          audioContext = new AudioContextCtor();
          if (audioGestureObserved) unlockAudio();
          state.addListener({ event: (_entry, event) => playAudio(asset, event && event.data && event.data.audioPath) });
          setHasAudio(Array.isArray(asset.manifest.audio) ? asset.manifest.audio.length > 0 : (asset.manifest.files || []).some((file) => /\.(mp3|ogg|wav|m4a)$/i.test(file.path)));
        }
        if (animation && skeletonData.findAnimation(animation)) state.setAnimation(0, animation, loop);
        else if (skeletonData.animations && skeletonData.animations.length > 0) state.setAnimation(0, skeletonData.animations[0].name, loop);
        sceneRenderer = new Spine.SceneRenderer(canvas, gl, false);
        state.apply(skeletonObj);
        skeletonObj.updateWorldTransform(physicsMode);
        frameSpineCamera();
        lastTime = 0;
        render();
      } catch (e) {
        fail('skeleton-parse', e);
      }
    }

    function setup(Spine, rawSkeleton, asset, binary) {
      if (disposed) return;
      try {
        gl = canvas.getContext('webgl', { alpha: true }) || canvas.getContext('experimental-webgl', { alpha: true });
        if (!gl) throw new Error('WebGL not available');
        assetManager = new Spine.AssetManager(gl);
        assetManager.loadTextureAtlas(asset.atlas);
        assetManager.loadAll()
          .then(() => onLoaded(Spine, rawSkeleton, asset, binary))
          .catch((e) => fail('atlas-or-texture-load', e));
      } catch (e) {
        fail('webgl-setup', e);
      }
    }

    let cancelled = false;
    const loadAsset = src && src.kind === 'spine' && src.version === 1 && src.assetId
      ? fetch(((typeof window !== 'undefined' && window.__WORKBENCH_SPINE_ASSET_BASE__) || '/assets/animations') + '/' + encodeURIComponent(src.assetId) + '/manifest.json', { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('Spine manifest unavailable'); return r.json(); }).then((manifest) => ({ manifest, skeleton: manifest.skeleton, atlas: manifest.atlas, textures: manifest.textures || [] }))
      : Promise.reject(new Error('SpinePlayer src 必须是 SpineAssetRefV1'));
    loadAsset.then((asset) => {
      if (cancelled || !asset) return;
      const base = asset.manifest.assetId ? (((typeof window !== 'undefined' && window.__WORKBENCH_SPINE_ASSET_BASE__) || '/assets/animations') + '/' + encodeURIComponent(asset.manifest.assetId) + '/') : '';
      const resolvedAsset = { ...asset, base, skeleton: asset.skeleton.startsWith('/') || asset.skeleton.startsWith('http') ? asset.skeleton : base + asset.skeleton, atlas: asset.atlas.startsWith('/') || asset.atlas.startsWith('http') ? asset.atlas : base + asset.atlas };
      return fetch(resolvedAsset.skeleton, { credentials: 'same-origin' }).then((response) => { if (!response.ok) throw new Error('Spine skeleton unavailable'); return response.arrayBuffer(); }).then((buf) => {
        if (disposed) return;
        const binary = /\.skel(\.bytes)?$/i.test(resolvedAsset.skeleton);
        return importRuntime(asset.manifest.spineVersion || sniffVersion(buf, binary))
          .then((mod) => setup(mod, buf, resolvedAsset, binary))
          .catch((e) => fail('runtime-import', e));
      });
    })
    .catch((e) => fail('manifest-or-skeleton-load', e));
    return () => {
      disposed = true;
      cancelled = true;
      unlockAudioRef.current = () => {};
      if (spineProbeUnregister) spineProbeUnregister();
      spineProbeUnregister = null;
      unlockEvents.forEach((eventName) => window.removeEventListener(eventName, unlockAudio));
      if (animFrame) cancelAnimationFrame(animFrame);
      activeAudioSources.forEach((source) => { try { source.stop(); } catch (e) {} });
      if (audioContext) audioContext.close().catch(() => {});
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [src, animation, loop, audioEnabled, fit, alignment, hasSrc, onError]);

  if (!hasSrc || failed) {
    return fallback ? React.createElement('div', { className: cx('flex items-center justify-center overflow-hidden', className), style, ...rest }, fallback) : null;
  }
  return React.createElement('div', { className: cx('relative overflow-hidden', className), style, ...rest },
    React.createElement('div', { ref: containerRef, className: 'h-full w-full' }),
    hasAudio ? React.createElement('button', {
      type: 'button',
      className: 'absolute right-2 top-2 rounded-full bg-black/45 px-2 py-1 text-xs text-white transition hover:bg-black/65',
      'aria-label': audioMuted ? '开启 Spine 音效' : '静音 Spine 音效',
      onClick: () => { const next = !audioMutedRef.current; audioMutedRef.current = next; setAudioMuted(next); if (!next) unlockAudioRef.current(); },
    }, audioMuted ? '🔇' : '🔊') : null,
  );
}

export function MediaViz(props) {
  const { bars = 16, className } = props || {};
  return React.createElement('div', { className: cx('flex h-12 items-end gap-1', className), 'aria-hidden': true },
    Array.from({ length: bars }).map((_, index) => React.createElement('span', {
      key: index,
      className: 'w-1 rounded-full bg-current',
      style: { height: 20 + (index * 17 % 28) + '%' }
    }))
  );
}

export function Carousel(props) {
  const { items = [], renderItem, className } = props || {};
  const [index, setIndex] = React.useState(0);
  const item = items[index] || null;
  return React.createElement('div', { className: cx('relative', className) },
    typeof renderItem === 'function' ? renderItem(item, index) : React.createElement('div', null, item == null ? '' : String(item)),
    items.length > 1 ? React.createElement('div', { className: 'mt-3 flex justify-center gap-2' },
      items.map((_, dotIndex) => React.createElement('button', {
        key: dotIndex,
        type: 'button',
        'aria-label': '切换到第 ' + (dotIndex + 1) + ' 项',
        className: dotIndex === index ? 'h-2 w-4 rounded-full bg-neutral-950' : 'h-2 w-2 rounded-full bg-neutral-300',
        onClick: () => setIndex(dotIndex)
      }))
    ) : null
  );
}
`;
}

export function getPreviewDependencyUrl(
  packageName: string,
  options: PreviewRuntimeResolveOptions = {},
): string {
  if (!options.preferCdn) {
    const localUrl = buildLocalPackageUrl(packageName, options);
    if (localUrl) return localUrl;
  }

  if (packageName === "@preview/sdk") {
    if (!options.preferCdn) {
      const localUrl = buildLocalPackageUrl(packageName, options);
      if (localUrl) return localUrl;
    }
    return `data:application/javascript;charset=utf-8,${encodeURIComponent(createPreviewSdkSource(options))}`;
  }
  return buildCdnPackageUrl(packageName);
}
