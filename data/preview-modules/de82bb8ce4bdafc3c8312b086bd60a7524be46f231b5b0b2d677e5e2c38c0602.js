import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from "http://localhost:3200/preview-runtime/vendor/react.js";









const TextDemo = (props) => {
  const globalProps = props ;
  const primaryColor = (globalProps.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((globalProps.darkMode ), () => ( false));

  const {
    mainTitle = '探索无限可能',
    subtitle = '用配置驱动你的创意',
    bodyText = '通过右侧配置面板修改文字内容，左侧实时预览效果。',
    richContent = '<h3>为什么选择我们？</h3><p><strong>灵活</strong>的配置方案，<em>轻松定制</em>每一个细节。</p>',
    customCSS = ".demo-box {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  padding: 16px;\n  border-radius: 12px;\n  color: white;\n}",
  } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const Card = ({ label, type, children }) => (
    _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
      _jsxs('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }, children: [
        _jsx('span', { style: { fontSize: '12px', fontWeight: 600, color: primaryColor }, children: type})
        , _jsx('span', { style: { fontSize: '15px', fontWeight: 600, color: textColor }, children: label})
      ]})
      , _jsx('div', { style: { padding: '20px' }, children: children})
    ]})
  );

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }, children: [
      _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }, children: "文本输入"})

      , _jsx(Card, { label: "mainTitle", type: "string", children: 
        _jsx('div', { style: { fontSize: '32px', fontWeight: 700, color: textColor }, children: mainTitle})
      })

      , _jsxs(Card, { label: "subtitle", type: "string · maxLength"  , children: [
        _jsx('div', { style: { fontSize: '18px', fontWeight: 500, color: mutedColor }, children: subtitle})
        , _jsxs('div', { style: { marginTop: '8px', fontSize: '12px', color: subtitle.length > 50 ? '#ef4444' : mutedColor }, children: [subtitle.length, "/50"]})
      ]})

      , _jsx(Card, { label: "bodyText", type: "string", children: 
        _jsx('div', { style: { fontSize: '15px', lineHeight: '1.7', color: textColor }, children: bodyText})
      })

      , _jsx(Card, { label: "richContent", type: "richtext", children: 
        _jsx('div', { style: { fontSize: '15px', lineHeight: '1.7', color: textColor }, dangerouslySetInnerHTML: { __html: richContent },} )
      })

      , _jsxs(Card, { label: "customCSS", type: "code", children: [
        _jsx('div', { style: { fontSize: '13px', fontFamily: 'monospace', color: mutedColor, whiteSpace: 'pre-wrap', backgroundColor: darkMode ? '#0d1117' : '#f6f8fa', padding: '12px', borderRadius: '8px', marginBottom: '12px' }, children: 
          customCSS
        })
        , _jsx('style', { children: customCSS})
        , _jsx('div', { className: "demo-box", style: { textAlign: 'center' }, children: "CSS 效果预览" })
      ]})
    ]})
  );
};

export default TextDemo;
