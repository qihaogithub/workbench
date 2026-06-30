import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from "http://localhost:3200/preview-runtime/vendor/react.js";

export default function SwitchDemo(props) {
  const primaryColor = (props.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((props.darkMode ), () => ( false));

  const showHeader = _nullishCoalesce((props.showHeader ), () => ( true));
  const showSidebar = _nullishCoalesce((props.showSidebar ), () => ( true));
  const showFooter = _nullishCoalesce((props.showFooter ), () => ( true));
  const enableShadow = _nullishCoalesce((props.enableShadow ), () => ( true));
  const layout = (props.layout ) || 'grid';
  const theme = (props.theme ) || 'light';
  const cardSize = (props.cardSize ) || 'medium';

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const miniTheme = theme === 'dark' ? { bg: '#1e293b', text: '#f1f5f9', card: '#334155', muted: '#94a3b8', border: '#475569' }
    : theme === 'ocean' ? { bg: '#0c4a6e', text: '#e0f2fe', card: '#075985', muted: '#7dd3fc', border: '#0369a1' }
    : { bg: '#ffffff', text: '#1e293b', card: '#f8fafc', muted: '#64748b', border: '#e2e8f0' };

  const cardSizeMap = {
    small: { padding: '8px', fontSize: '11px' },
    medium: { padding: '14px', fontSize: '13px' },
    large: { padding: '20px', fontSize: '15px' },
  };
  const sz = cardSizeMap[cardSize] || cardSizeMap.medium;

  const layoutStyle =
    layout === 'list' ? { display: 'flex', flexDirection: 'column', gap: '8px' }
    : { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' };

  const ToggleRow = ({ label, value }) => (
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }, children: [
      _jsx('div', { style: { width: '36px', height: '20px', borderRadius: '10px', backgroundColor: value ? primaryColor : borderColor, position: 'relative' }, children: 
        _jsx('div', { style: { width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: value ? '18px' : '2px', transition: 'left 0.2s' },} )
      })
      , _jsx('span', { style: { fontSize: '14px', color: textColor }, children: label})
      , _jsx('span', { style: { fontSize: '12px', fontWeight: 600, color: value ? '#22c55e' : '#ef4444', marginLeft: 'auto' }, children: value ? 'ON' : 'OFF'})
    ]})
  );

  const SelectRow = ({ label, value, options }) => (
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }, children: [
      _jsx('span', { style: { fontSize: '14px', color: textColor }, children: label})
      , _jsx('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto' }, children: 
        options.map((opt) => (
          _jsx('span', { style: { fontSize: '12px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, backgroundColor: opt === value ? primaryColor + '22' : 'transparent', color: opt === value ? primaryColor : mutedColor, border: opt === value ? `1px solid ${primaryColor}44` : `1px solid ${borderColor}` }, children: opt}, opt)
        ))
      })
    ]})
  );

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }, children: [
      _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }, children: "开关与选择"})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "boolean"})
        , _jsxs('div', { style: { padding: '16px 20px' }, children: [
          _jsx(ToggleRow, { label: "showHeader", value: showHeader,} )
          , _jsx(ToggleRow, { label: "showSidebar", value: showSidebar,} )
          , _jsx(ToggleRow, { label: "showFooter", value: showFooter,} )
          , _jsx(ToggleRow, { label: "enableShadow", value: enableShadow,} )
        ]})
      ]})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "enum"})
        , _jsxs('div', { style: { padding: '16px 20px' }, children: [
          _jsx(SelectRow, { label: "layout", value: layout, options: ['grid', 'list', 'masonry'],} )
          , _jsx(SelectRow, { label: "theme", value: theme, options: ['light', 'dark', 'ocean'],} )
          , _jsx(SelectRow, { label: "cardSize", value: cardSize, options: ['small', 'medium', 'large'],} )
        ]})
      ]})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: mutedColor }, children: "预览效果"})
        , _jsx('div', { style: { padding: '16px' }, children: 
          _jsxs('div', { style: { borderRadius: '10px', border: `1px solid ${borderColor}`, overflow: 'hidden', backgroundColor: miniTheme.bg }, children: [
            showHeader && (
              _jsxs('div', { style: { height: '40px', backgroundColor: primaryColor, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '20px' }, children: [
                _jsx('span', { style: { color: '#fff', fontWeight: 700, fontSize: '13px' }, children: "MyApp"})
                , _jsx('span', { style: { color: '#ffffffcc', fontSize: '12px' }, children: "首页"})
                , _jsx('span', { style: { color: '#ffffffcc', fontSize: '12px' }, children: "产品"})
              ]})
            )
            , _jsxs('div', { style: { display: 'flex', minHeight: '120px' }, children: [
              showSidebar && (
                _jsxs('div', { style: { width: '100px', backgroundColor: miniTheme.card, borderRight: `1px solid ${miniTheme.border}`, padding: '10px', flexShrink: 0 }, children: [
                  _jsx('div', { style: { fontSize: '11px', padding: '4px 6px', borderRadius: '4px', backgroundColor: primaryColor + '22', color: primaryColor, fontWeight: 600 }, children: "📊 仪表盘" })
                  , _jsx('div', { style: { fontSize: '11px', padding: '4px 6px', color: miniTheme.muted }, children: "📁 项目" })
                ]})
              )
              , _jsx('div', { style: { flex: 1, padding: '12px' }, children: 
                _jsx('div', { style: layoutStyle, children: 
                  ['📄 文档', '📊 报表', '🔔 通知', '👤 设置'].map((t) => (
                    _jsx('div', { style: { backgroundColor: miniTheme.card, borderRadius: '6px', border: `1px solid ${miniTheme.border}`, padding: sz.padding, fontSize: sz.fontSize, color: miniTheme.text, boxShadow: enableShadow ? '0 2px 6px rgba(0,0,0,0.1)' : 'none' }, children: t}, t)
                  ))
                })
              })
            ]})
            , showFooter && (
              _jsx('div', { style: { height: '30px', backgroundColor: miniTheme.card, borderTop: `1px solid ${miniTheme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: miniTheme.muted }, children: "© 2026 MyApp"  })
            )
          ]})
        })
      ]})
    ]})
  );
}
