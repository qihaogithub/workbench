import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }import React from "http://localhost:3200/preview-runtime/vendor/react.js";



















const SECTION_COLORS = {
  heroSection: '#3b82f6',
  featureSection: '#22c55e',
  testimonialSection: '#f59e0b',
};

const BADGE_COLORS = {
  badge1: '#3b82f6',
  badge2: '#ec4899',
  badge3: '#8b5cf6',
  badge4: '#f59e0b',
};

const DEFAULT_POSITIONS = {
  badge1: { x: 80, y: 50 },
  badge2: { x: 260, y: 50 },
  badge3: { x: 440, y: 50 },
  badge4: { x: 170, y: 170 },
  logoImage: { x: 500, y: 130 },
};

const PositionDemo = (props) => {
  const globalProps = props ;
  const primaryColor = (globalProps.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((globalProps.darkMode ), () => ( false));

  const {
    heroSection = '欢迎来到我们的平台',
    featureSection = '核心功能展示',
    testimonialSection = '用户评价',
    navHome = '首页',
    navProducts = '产品',
    navAbout = '关于',
    navContact = '联系我们',
    badge1 = 'NEW',
    badge2 = 'HOT',
    badge3 = 'PRO',
    badge4 = 'BETA',
    logoImage,
    __order,
    __orderH,
    __positions,
  } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const sectionBg = darkMode ? '#1a2332' : '#f1f5f9';

  const horizontalOrder = __orderH || ['navHome', 'navProducts', 'navAbout', 'navContact'];
  const verticalOrder = __order || ['heroSection', 'featureSection', 'testimonialSection'];
  const positions = __positions || DEFAULT_POSITIONS;

  const navData = { navHome, navProducts, navAbout, navContact };
  const sectionData = { heroSection, featureSection, testimonialSection };
  const badgeData = { badge1, badge2, badge3, badge4 };

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }, children: [
      _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }, children: "位置与排序"})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "orderableHorizontal · 横向排序"  })
        , _jsx('div', { style: { padding: '16px' }, children: 
          _jsx('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '12px', borderRadius: '8px', backgroundColor: sectionBg }, children: 
            horizontalOrder.map((key, index) => (
              _jsx('span', { style: { padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, color: index === 0 ? '#fff' : textColor, backgroundColor: index === 0 ? primaryColor : (darkMode ? '#334155' : '#e2e8f0') }, children: navData[key]}, key)
            ))
          })
        })
      ]})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "orderable · 纵向排序"  })
        , _jsx('div', { style: { padding: '16px' }, children: 
          verticalOrder.map((key, index) => {
            const color = SECTION_COLORS[key] || '#94a3b8';
            return (
              _jsxs('div', { style: { marginBottom: index < verticalOrder.length - 1 ? '10px' : '0', borderRadius: '8px', backgroundColor: sectionBg, borderLeft: `3px solid ${color}`, padding: '10px 14px' }, children: [
                _jsx('span', { style: { fontSize: '14px', fontWeight: 600, color: textColor }, children: sectionData[key]})
                , _jsxs('span', { style: { fontSize: '11px', marginLeft: '8px', color: mutedColor }, children: ["#", index + 1]})
              ]}, key)
            );
          })
        })
      ]})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "positionable · 自由坐标"  })
        , _jsx('div', { style: { padding: '16px' }, children: 
          _jsxs('div', { style: { position: 'relative', minHeight: '220px', backgroundColor: sectionBg, borderRadius: '10px', border: `2px dashed ${borderColor}`, overflow: 'hidden' }, children: [
            Object.entries(badgeData).map(([key, text]) => {
              const pos = positions[key] || { x: 0, y: 0 };
              const color = BADGE_COLORS[key] || '#94a3b8';
              return (
                _jsxs('div', { 'data-pos-key': key, style: { position: 'absolute', left: pos.x, top: pos.y, padding: '5px 14px', borderRadius: '16px', fontSize: '12px', fontWeight: 700, color: '#fff', backgroundColor: color, whiteSpace: 'nowrap' }, children: [
                  text, " " , _jsxs('span', { style: { opacity: 0.7, fontSize: '10px' }, children: ["(", pos.x, ",", pos.y, ")"]})
                ]}, key)
              );
            })
            , logoImage && (
              _jsx('img', {
                'data-pos-key': "logoImage",
                src: logoImage,
                alt: "Logo",
                style: {
                  position: 'absolute',
                  left: _nullishCoalesce(_optionalChain([positions, 'access', _ => _.logoImage, 'optionalAccess', _2 => _2.x]), () => ( 500)),
                  top: _nullishCoalesce(_optionalChain([positions, 'access', _3 => _3.logoImage, 'optionalAccess', _4 => _4.y]), () => ( 130)),
                  maxWidth: '120px',
                  maxHeight: '60px',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                },}
              )
            )
          ]})
        })
      ]})
    ]})
  );
};

export default PositionDemo;
