export interface IframeTemplateOptions {
  cssImports?: string[];
  compiledCode?: string;
  configData?: Record<string, unknown>;
  cdnBaseUrl?: string;
}

import { getCdnBaseUrl } from './cdn-config';

function generateCssLinks(cssImports: string[], cdnBase: string): string {
  if (!cssImports.length) return '';
  return cssImports
    .map((url) => {
      const href = url.startsWith('http') ? url : `${cdnBase}/${url}`;
      return `    <link rel="stylesheet" href="${href}" data-dynamic-css="true">`;
    })
    .join('\n');
}

export function generateIframeHtml(options: IframeTemplateOptions = {}): string {
  const { cssImports = [], compiledCode, configData, cdnBaseUrl } = options;
  const cdnBase = cdnBaseUrl || getCdnBaseUrl();

  const cssLinks = generateCssLinks(cssImports, cdnBase);
  const initialCode = compiledCode ? JSON.stringify(compiledCode) : 'null';
  const initialConfig = JSON.stringify(configData || {});

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="${cdnBase}" crossorigin>
  <link rel="dns-prefetch" href="${cdnBase}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; }
    #root { min-height: 100vh; }
  </style>
${cssLinks}
  <script src="https://cdn.jsdelivr.net/npm/tailwindcss-cdn@3.4.10/tailwindcss.min.js"></script>
</head>
<body>
  <div id="root"></div>

  <script type="module">
    import React from '${cdnBase}/react@18.3.1';
    import ReactDOM from '${cdnBase}/react-dom@18.3.1/client';

    let currentRoot = null;
    let currentConfig = ${initialConfig};
    let currentComponent = null;

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
      console.log('[iframe] renderComponent 调用', { hasComponent: !!currentComponent, config: currentConfig });
      if (!currentComponent) {
        console.warn('[iframe] currentComponent 为空，无法渲染');
        return;
      }
      const container = document.getElementById('root');
      if (!container) {
        console.error('[iframe] 找不到 #root 元素');
        return;
      }
      if (!currentRoot) {
        console.log('[iframe] 创建 React root');
        currentRoot = ReactDOM.createRoot(container);
      }
      console.log('[iframe] 开始渲染组件');
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

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;

      const { type, code, configData: newConfigData, cssImports: newCssImports } = event.data;

      console.log('[iframe] 收到消息', { type, codeLength: code?.length });

      if (type === 'UPDATE_CODE') {
        console.log('[iframe] 处理 UPDATE_CODE', { configData: newConfigData, cssImports: newCssImports });
        currentConfig = newConfigData || {};
        updateCssLinks(newCssImports || []);

        const blob = new Blob([code], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);

        console.log('[iframe] 开始加载模块', { moduleUrl });

        import(moduleUrl)
          .then((module) => {
            console.log('[iframe] 模块加载成功', { hasDefault: !!module.default });
            currentComponent = module.default;
            renderComponent();
            window.parent.postMessage({ type: 'LOADED' }, '*');
          })
          .catch((err) => {
            console.error('[iframe] 模块加载失败', err);
            window.parent.postMessage({ type: 'RUNTIME_ERROR', error: err.message, stack: err.stack }, '*');
          });
      }

      if (type === 'UPDATE_CONFIG') {
        console.log('[iframe] 处理 UPDATE_CONFIG', { configData: newConfigData });
        currentConfig = newConfigData || {};
        if (currentComponent) {
          renderComponent();
        }
      }
    });

    // ResizeObserver：监听 body 高度变化
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        window.parent.postMessage({ type: 'RESIZE', height }, '*');
      }
    });
    resizeObserver.observe(document.body);

    // 全局错误捕获
    window.addEventListener('error', (event) => {
      window.parent.postMessage({
        type: 'RUNTIME_ERROR',
        error: event.message,
        source: event.filename,
        line: event.lineno
      }, '*');
    });

    // 未捕获的 Promise 错误
    window.addEventListener('unhandledrejection', (event) => {
      window.parent.postMessage({
        type: 'RUNTIME_ERROR',
        error: event.reason?.message || String(event.reason)
      }, '*');
    });

    console.log('[iframe] 脚本开始执行');

    // 通知父窗口 iframe 已就绪
    console.log('[iframe] 发送 READY 消息');
    window.parent.postMessage({ type: 'READY' }, '*');

    // 如果有预置代码（嵌入场景），直接加载
    const initialCode = ${initialCode};
    if (initialCode) {
      const blob = new Blob([initialCode], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      import(moduleUrl)
        .then((module) => {
          currentComponent = module.default;
          renderComponent();
        })
        .catch((err) => {
          window.parent.postMessage({ type: 'RUNTIME_ERROR', error: err.message }, '*');
        });
    }
  </script>
</body>
</html>`;
}
