import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from "http://localhost:3200/preview-runtime/vendor/react.js";










const EMOJIS = ['🚀', '🎨', '💡', '📊', '🔒', '🔄', '⭐', '🎯', '🎪', '🌈', '🎸', '🎵'];

const NumberDemo = (props) => {
  const globalProps = props ;
  const primaryColor = (globalProps.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((globalProps.darkMode ), () => ( false));

  const { cardCount = 6, fontSize = 20, borderWidth = 2, spacing = 20, opacity = 100, priority = 3 } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const Card = ({ label, type, value, children }) => (
    _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
      _jsxs('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }, children: [
        _jsx('span', { style: { fontSize: '12px', fontWeight: 600, color: primaryColor }, children: type})
        , _jsx('span', { style: { fontSize: '15px', fontWeight: 600, color: textColor }, children: label})
        , _jsx('span', { style: { fontSize: '13px', color: mutedColor, marginLeft: 'auto' }, children: value})
      ]})
      , _jsx('div', { style: { padding: '20px' }, children: children})
    ]})
  );

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }, children: [
      _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }, children: "数字与范围"})

      , _jsx(Card, { label: "cardCount", type: "number", value: `${cardCount}`, children: 
        _jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' }, children: 
          Array.from({ length: cardCount }, (_, i) => (
            _jsxs('div', { style: { backgroundColor: darkMode ? '#1a2332' : '#f1f5f9', border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '12px', textAlign: 'center' }, children: [
              _jsx('div', { style: { fontSize: '24px' }, children: EMOJIS[i % EMOJIS.length]})
              , _jsxs('div', { style: { fontSize: '11px', color: mutedColor, marginTop: '4px' }, children: ["#", i + 1]})
            ]}, i)
          ))
        })
      })

      , _jsx(Card, { label: "fontSize", type: "number", value: `${fontSize}px`, children: 
        _jsx('span', { style: { fontSize: `${fontSize}px`, fontWeight: 600, color: textColor }, children: "字体大小预览"})
      })

      , _jsx(Card, { label: "borderWidth", type: "number", value: `${borderWidth}px`, children: 
        _jsxs('div', { style: { width: '100px', height: '100px', border: `${borderWidth}px solid ${primaryColor}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mutedColor, fontSize: '13px' }, children: ["边框 "
           , borderWidth, "px"
        ]})
      })

      , _jsx(Card, { label: "spacing", type: "number", value: `${spacing}px`, children: 
        _jsx('div', { style: { display: 'flex', alignItems: 'center' }, children: 
          [0, 1, 2].map((i) => (
            _jsx('div', { style: { width: '24px', height: '24px', borderRadius: '50%', backgroundColor: primaryColor, marginLeft: i === 0 ? 0 : `${spacing}px` },}, i )
          ))
        })
      })

      , _jsx(Card, { label: "opacity", type: "number", value: `${opacity}%`, children: 
        _jsxs('div', { style: { width: '120px', height: '80px', background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}88)`, borderRadius: '10px', opacity: opacity / 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: '14px' }, children: [
          opacity, "% 不透明度"
        ]})
      })

      , _jsx(Card, { label: "priority", type: "integer", value: `${priority}`, children: 
        _jsx('div', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: primaryColor, color: '#fff', fontWeight: 700, fontSize: '28px' }, children: 
          priority
        })
      })
    ]})
  );
};

export default NumberDemo;
