import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from "http://localhost:3200/preview-runtime/vendor/react.js";



function getImageUrl(item) {
  return typeof item === 'string' ? item : item.url;
}

export default function ColorDemo(props) {
  const globalPrimary = (props.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((props.darkMode ), () => ( false));

  const primaryColorVal = (props.primaryColor ) || '#6366f1';
  const secondaryColorVal = (props.secondaryColor ) || '#ec4899';
  const backgroundColorVal = (props.backgroundColor ) || '#f8fafc';
  const heroImage = (props.heroImage ) || 'https://picsum.photos/seed/hero42/800/400';
  const galleryImages = (props.galleryImages ) || [
    'https://picsum.photos/seed/gal1/300/200',
    'https://picsum.photos/seed/gal2/300/200',
    'https://picsum.photos/seed/gal3/300/200',
  ];

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const Card = ({ label, type, value, children }) => (
    _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
      _jsxs('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }, children: [
        _jsx('span', { style: { fontSize: '12px', fontWeight: 600, color: globalPrimary }, children: type})
        , _jsx('span', { style: { fontSize: '15px', fontWeight: 600, color: textColor }, children: label})
        , _jsx('span', { style: { fontSize: '13px', fontFamily: 'monospace', color: mutedColor, marginLeft: 'auto' }, children: value})
      ]})
      , _jsx('div', { style: { padding: '20px' }, children: children})
    ]})
  );

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }, children: [
      _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }, children: "颜色与图片"})

      , _jsx(Card, { label: "primaryColor", type: "color", value: primaryColorVal, children: 
        _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [
          _jsx('div', { style: { width: '60px', height: '60px', borderRadius: '10px', backgroundColor: primaryColorVal },} )
          , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' }, children: [
            _jsx('button', { style: { padding: '6px 16px', borderRadius: '6px', backgroundColor: primaryColorVal, color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600 }, children: "按钮"})
            , _jsx('div', { style: { height: '6px', borderRadius: '3px', backgroundColor: borderColor, overflow: 'hidden', width: '150px' }, children: 
              _jsx('div', { style: { width: '72%', height: '100%', borderRadius: '3px', backgroundColor: primaryColorVal },} )
            })
          ]})
        ]})
      })

      , _jsx(Card, { label: "secondaryColor", type: "color", value: secondaryColorVal, children: 
        _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [
          _jsx('div', { style: { width: '60px', height: '60px', borderRadius: '10px', backgroundColor: secondaryColorVal },} )
          , _jsxs('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' }, children: [
            _jsx('span', { style: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: secondaryColorVal + '22', color: secondaryColorVal }, children: "标签"})
            , _jsx('span', { style: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: secondaryColorVal, display: 'inline-block' },} )
            , _jsx('span', { style: { fontSize: '13px', color: textColor, textDecoration: 'underline', textDecorationColor: secondaryColorVal, textUnderlineOffset: '3px' }, children: "下划线"})
          ]})
        ]})
      })

      , _jsx(Card, { label: "backgroundColor", type: "color", value: backgroundColorVal, children: 
        _jsxs('div', { style: { backgroundColor: backgroundColorVal, borderRadius: '8px', padding: '20px', border: `1px solid ${borderColor}` }, children: [
          _jsx('div', { style: { fontSize: '14px', color: '#1e293b', fontWeight: 600 }, children: "背景色预览"})
          , _jsxs('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' }, children: [
            _jsx('span', { style: { padding: '3px 10px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#1e293b', color: '#f8fafc' }, children: "深色"})
            , _jsx('span', { style: { padding: '3px 10px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#ffffff', color: '#1e293b', border: '1px solid #e2e8f0' }, children: "浅色"})
          ]})
        ]})
      })

      , _jsx(Card, { label: "heroImage", type: "image", value: heroImage.length > 40 ? heroImage.substring(0, 40) + '...' : heroImage, children: 
        _jsx('img', { src: heroImage, alt: "hero", style: { width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px' },} )
      })

      , _jsx(Card, { label: "galleryImages", type: "imageList", value: `${galleryImages.length} 张`, children: 
        _jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }, children: 
          galleryImages.map((item, i) => (
            _jsx('img', { src: getImageUrl(item), alt: `gallery-${i}`, style: { width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px' },}, i )
          ))
        })
      })
    ]})
  );
}
