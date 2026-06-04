export interface IframeTemplateOptions {
  cssImports?: string[];
  compiledCode?: string;
  configData?: Record<string, unknown>;
  cdnBaseUrl?: string;
  supportUrlMode?: boolean;
  baseOrigin?: string;
}

const DEFAULT_CDN_BASE = "https://esm.sh";

const consoleInterceptScript = `
(function() {
  const _orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };
  function _serialize(args) {
    return Array.from(args).map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); }
        catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  }
  ['log','warn','error','info','debug'].forEach(lv => {
    console[lv] = function() {
      _orig[lv].apply(console, arguments);
      window.parent.postMessage({
        type: 'CONSOLE_LOG',
        payload: { level: lv, args: _serialize(arguments), timestamp: Date.now() }
      }, '*');
    };
  });
})();
`;

function generateCssLinks(cssImports: string[], cdnBase: string): string {
  if (!cssImports.length) return "";
  return cssImports
    .map((url) => {
      const href = url.startsWith("http") ? url : `${cdnBase}/${url}`;
      return `    <link rel="stylesheet" href="${href}" data-dynamic-css="true">`;
    })
    .join("\n");
}

export function generateIframeHtml(
  options: IframeTemplateOptions = {},
): string {
  const {
    cssImports = [],
    compiledCode,
    configData,
    cdnBaseUrl,
    supportUrlMode = true,
    baseOrigin,
  } = options;
  const cdnBase = cdnBaseUrl || DEFAULT_CDN_BASE;

  const cssLinks = generateCssLinks(cssImports, cdnBase);
  const initialCode = compiledCode ? JSON.stringify(compiledCode) : "null";
  const initialConfig = JSON.stringify(configData || {});

  const loadModuleFn = `
    function loadModuleFromCode(code, thisVersion) {
      const blob = new Blob([code], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      import(moduleUrl)
        .then((module) => {
          if (thisVersion !== updateVersion) return;
          currentComponent = module.default || null;
          renderComponent();
          URL.revokeObjectURL(moduleUrl);
          if (module.default) {
            window.parent.postMessage({ type: 'LOADED' }, '*');
          } else {
            window.parent.postMessage({ type: 'RUNTIME_ERROR', error: '模块没有默认导出（export default）' }, '*');
          }
        })
        .catch((err) => {
          if (thisVersion !== updateVersion) return;
          window.parent.postMessage({ type: 'RUNTIME_ERROR', error: err.message, stack: err.stack }, '*');
        });
    }`;

  const updateCodeHandler = supportUrlMode
    ? `
      if (type === 'UPDATE_CODE') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateCssLinks(newCssImports || []);

        const thisVersion = ++updateVersion;

        if (isUrl) {
          fetch(code)
            .then(res => {
              if (!res.ok) throw new Error('加载预编译代码失败: ' + res.status);
              return res.text();
            })
            .then(jsCode => {
              if (thisVersion !== updateVersion) return;
              loadModuleFromCode(jsCode, thisVersion);
            })
            .catch((err) => {
              if (thisVersion !== updateVersion) return;
              window.parent.postMessage({ type: 'RUNTIME_ERROR', error: err.message }, '*');
            });
        } else {
          loadModuleFromCode(code, thisVersion);
        }
      }`
    : `
      if (type === 'UPDATE_CODE') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateCssLinks(newCssImports || []);

        const thisVersion = ++updateVersion;

        const blob = new Blob([code], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);

        import(moduleUrl)
          .then((module) => {
            if (thisVersion !== updateVersion) return;
            currentComponent = module.default || null;
            renderComponent();
            URL.revokeObjectURL(moduleUrl);
            if (module.default) {
              window.parent.postMessage({ type: 'LOADED' }, '*');
            } else {
              window.parent.postMessage({ type: 'RUNTIME_ERROR', error: '模块没有默认导出（export default）' }, '*');
            }
          })
          .catch((err) => {
            if (thisVersion !== updateVersion) return;
            window.parent.postMessage({ type: 'RUNTIME_ERROR', error: err.message, stack: err.stack }, '*');
          });
      }`;

  const baseTag = baseOrigin ? `<base href="${baseOrigin}/">` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseTag}
  <link rel="preconnect" href="${cdnBase}" crossorigin>
  <link rel="dns-prefetch" href="${cdnBase}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; background-color: #ffffff; }
    #root { min-height: 100vh; }
  </style>
${cssLinks}
  <script type="importmap">
  {
    "imports": {
      "react": "${cdnBase}/react@18.3.1",
      "react-dom": "${cdnBase}/react-dom@18.3.1/client",
      "react/jsx-runtime": "${cdnBase}/react@18.3.1/jsx-runtime",
      "react/jsx-dev-runtime": "${cdnBase}/react@18.3.1/jsx-dev-runtime"
    }
  }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/tailwindcss-cdn@3.4.10/tailwindcss.min.js"></script>
</head>
<body>
  <div id="root"></div>

  <script type="module">
    ${consoleInterceptScript}

    import React from '${cdnBase}/react@18.3.1';
    import ReactDOM from '${cdnBase}/react-dom@18.3.1/client';

    let currentRoot = null;
    let currentConfig = ${initialConfig};
    let currentComponent = null;
    let updateVersion = 0;

    window.__DEMO_PROPS__ = currentConfig;

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }

      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }

      componentDidCatch(error, errorInfo) {
        window.parent.postMessage({ type: 'RUNTIME_ERROR', error: error.message, stack: error.stack }, '*');
      }

      render() {
        if (this.state.hasError) {
          return React.createElement('div', {
            style: {
              padding: '16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              fontFamily: 'system-ui, sans-serif'
            }
          },
            React.createElement('p', { style: { color: '#991b1b', fontWeight: 500, margin: '0 0 4px 0' } }, '渲染出错'),
            React.createElement('pre', {
              style: {
                color: '#dc2626',
                fontSize: '13px',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }
            }, this.state.error?.message || '组件运行时发生错误')
          );
        }
        return this.props.children;
      }
    }

    function renderComponent() {
      if (!currentComponent) return;
      const container = document.getElementById('root');
      if (!container) return;
      if (!currentRoot) {
        currentRoot = ReactDOM.createRoot(container);
      }
      currentRoot.render(
        React.createElement(ErrorBoundary, null,
          React.createElement(currentComponent, currentConfig)
        )
      );
    }

    function updateCssLinks(cssUrls) {
      document.querySelectorAll('link[data-dynamic-css]').forEach(el => el.remove());
      cssUrls.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url.startsWith('http') ? url : '${cdnBase}/' + url;
        link.setAttribute('data-dynamic-css', 'true');
        document.head.appendChild(link);
      });
    }

    ${loadModuleFn}

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;

      const { type, code, configData: newConfigData, cssImports: newCssImports${supportUrlMode ? ", isUrl" : ""} } = event.data;

      ${updateCodeHandler}

      if (type === 'UPDATE_CONFIG') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        if (currentComponent) {
          renderComponent();
        }
      }

      if (type === 'COLLECT_THUMBNAIL_LAYOUT') {
        try {
          (function() {
            function getCleanText(el) {
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                return el.value || el.placeholder || '';
              }
              return (el.textContent || '').replace(/\\s+/g, ' ').trim();
            }

            function isUsefulRawElement(el) {
              if (el.rect.width <= 0 || el.rect.height <= 0) return false;
              if (el.style.display === 'none') return false;
              if (el.style.visibility === 'hidden') return false;
              if (Number(el.style.opacity) === 0) return false;
              var area = el.rect.width * el.rect.height;
              if (area < 24 * 24) return false;
              var hasText = !!(el.text && el.text.trim());
              var hasImage = !!el.attrs.src || el.style.backgroundImage !== 'none';
              var bg = el.style.backgroundColor;
              var hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
              var hasShadow = el.style.boxShadow && el.style.boxShadow !== 'none';
              var hasBorder = el.style.border && el.style.border !== '0px none rgb(0, 0, 0)';
              return hasText || hasImage || hasBackground || hasShadow || hasBorder;
            }

            var viewport = { width: window.innerWidth, height: window.innerHeight };
            var elements = [];
            var all = document.querySelectorAll('*');
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              var rect = el.getBoundingClientRect();
              var style = window.getComputedStyle(el);
              var snapshot = {
                tag: el.tagName.toLowerCase(),
                text: getCleanText(el),
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                style: {
                  display: style.display,
                  visibility: style.visibility,
                  opacity: style.opacity,
                  backgroundColor: style.backgroundColor,
                  color: style.color,
                  fontSize: style.fontSize,
                  fontWeight: style.fontWeight,
                  borderRadius: style.borderRadius,
                  boxShadow: style.boxShadow,
                  border: style.border,
                  position: style.position,
                  zIndex: style.zIndex,
                  backgroundImage: style.backgroundImage
                },
                attrs: {
                  role: el.getAttribute('role'),
                  ariaLabel: el.getAttribute('aria-label'),
                  src: el instanceof HTMLImageElement ? (el.currentSrc || el.src) : undefined,
                  className: el instanceof HTMLElement ? (el.className ? el.className.toString() : undefined) : undefined
                }
              };
              if (isUsefulRawElement(snapshot)) {
                elements.push(snapshot);
              }
            }

            window.parent.postMessage({ type: 'THUMBNAIL_LAYOUT_RESULT', payload: { viewport: viewport, elements: elements } }, '*');
          })();
        } catch (err) {
          window.parent.postMessage({ type: 'THUMBNAIL_LAYOUT_ERROR', error: err.message }, '*');
        }
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        window.parent.postMessage({ type: 'RESIZE', height }, '*');
      }
    });
    resizeObserver.observe(document.body);

    window.addEventListener('error', (event) => {
      window.parent.postMessage({
        type: 'RUNTIME_ERROR',
        error: event.message,
        source: event.filename,
        line: event.lineno
      }, '*');
    });

    window.addEventListener('unhandledrejection', (event) => {
      window.parent.postMessage({
        type: 'RUNTIME_ERROR',
        error: event.reason?.message || String(event.reason)
      }, '*');
    });

    window.parent.postMessage({ type: 'READY' }, '*');

    const initialCode = ${initialCode};
    if (initialCode) {
      window.__DEMO_PROPS__ = currentConfig;
      const blob = new Blob([initialCode], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      import(moduleUrl)
        .then((module) => {
          currentComponent = module.default;
          renderComponent();
          URL.revokeObjectURL(moduleUrl);
          window.parent.postMessage({ type: 'COMPONENT_READY' }, '*');
        })
        .catch((err) => {
          window.parent.postMessage({ type: 'RUNTIME_ERROR', error: err.message }, '*');
        });
    }
  </script>
</body>
</html>`;
}

export function buildIframeHtml(cssImports?: string[]): string {
  return generateIframeHtml({ cssImports });
}
