const CDN_BASE = "https://esm.sh";

function generateCssLinks(cssImports: string[]): string {
  if (!cssImports.length) return "";
  return cssImports
    .map((url) => {
      const href = url.startsWith("http") ? url : `${CDN_BASE}/${url}`;
      return `    <link rel="stylesheet" href="${href}" data-dynamic-css="true">`;
    })
    .join("\n");
}

export function generateIframeHtml(): string {
  const cssLinksPlaceholder = "__CSS_LINKS_PLACEHOLDER__";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="${CDN_BASE}" crossorigin>
  <link rel="dns-prefetch" href="${CDN_BASE}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; background-color: #ffffff; }
    #root { min-height: 100vh; }
  </style>
  ${cssLinksPlaceholder}
  <script type="importmap">
  {
    "imports": {
      "react": "${CDN_BASE}/react@18.3.1",
      "react-dom": "${CDN_BASE}/react-dom@18.3.1/client",
      "react/jsx-runtime": "${CDN_BASE}/react@18.3.1/jsx-runtime",
      "react/jsx-dev-runtime": "${CDN_BASE}/react@18.3.1/jsx-dev-runtime"
    }
  }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/tailwindcss-cdn@3.4.10/tailwindcss.min.js"></script>
</head>
<body>
  <div id="root"></div>

  <script type="module">
    import React from '${CDN_BASE}/react@18.3.1';
    import ReactDOM from '${CDN_BASE}/react-dom@18.3.1/client';

    let currentRoot = null;
    let currentConfig = {};
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
        link.href = url.startsWith('http') ? url : '${CDN_BASE}/' + url;
        link.setAttribute('data-dynamic-css', 'true');
        document.head.appendChild(link);
      });
    }

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
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;

      const { type, code, configData: newConfigData, cssImports: newCssImports, isUrl } = event.data;

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
      }

      if (type === 'UPDATE_CONFIG') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        if (currentComponent) {
          renderComponent();
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
  </script>
</body>
</html>`;
}

export function buildIframeHtml(cssImports?: string[]): string {
  const html = generateIframeHtml();
  if (!cssImports || cssImports.length === 0) {
    return html.replace("__CSS_LINKS_PLACEHOLDER__", "");
  }
  return html.replace("__CSS_LINKS_PLACEHOLDER__", generateCssLinks(cssImports));
}
