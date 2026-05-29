import {jsxs as _jsxs, jsx as _jsx} from 'https://esm.sh/react@18.3.1/jsx-runtime'; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from 'https://esm.sh/react@18.3.1';












const ITEMS = [
  { title: '响应式布局', desc: '自适应各种屏幕尺寸，完美呈现', icon: '📱', color: '#3b82f6' },
  { title: '流畅动画', desc: '顺滑的交互动画，提升体验', icon: '✨', color: '#22c55e' },
  { title: '暗色模式', desc: '护眼的深色主题，夜间友好', icon: '🌙', color: '#8b5cf6' },
  { title: '自定义主题', desc: '随心搭配颜色方案', icon: '🎨', color: '#ec4899' },
  { title: '组件丰富', desc: '内置大量精美可复用组件', icon: '🧩', color: '#f59e0b' },
  { title: '性能优越', desc: '极致优化的渲染性能', icon: '⚡', color: '#ef4444' },
];

const ROUNDED_MAP = {
  none: 0, sm: 4, md: 8, lg: 12, xl: 20, full: 9999,
};

const DENSITY_MAP = {
  compact: { cardPadding: 10, gap: 8, titleSize: 13, descSize: 11 },
  comfortable: { cardPadding: 16, gap: 12, titleSize: 15, descSize: 12 },
  spacious: { cardPadding: 22, gap: 16, titleSize: 17, descSize: 13 },
};

const ConfigLayoutPage = (props) => {
  const globalProps = props ;
  const brandName = (globalProps.brandName ) || 'OpenCode Workbench';
  const primaryColor = (globalProps.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((globalProps.darkMode ), () => ( false));
  const companySlogan = (globalProps.companySlogan ) || '用配置驱动一切';

  const {
    layoutStyle = 'grid',
    animationEnabled = true,
    animationDuration = 400,
    columns = 2,
    roundedLevel = 'lg',
    showBorder = true,
    borderStyle = 'solid',
    contentDensity = 'comfortable',
  } = props;

  const density = DENSITY_MAP[contentDensity] || DENSITY_MAP.comfortable;
  const borderRadius = ROUNDED_MAP[roundedLevel] || 12;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const sectionBg = darkMode ? '#1a2332' : '#f1f5f9';

  const getCardStyle = (index) => {
    const base = {
      backgroundColor: cardBg,
      borderRadius,
      padding: density.cardPadding,
      border: showBorder ? `${borderStyle === 'dotted' ? '2px' : '1px'} ${borderStyle} ${borderColor}` : 'none',
      transition: `all ${animationDuration}ms ease`,
      opacity: 0,
      animation: animationEnabled ? `fadeSlideIn ${animationDuration}ms ease ${index * 80}ms forwards` : undefined,
    };
    return base;
  };

  const contentStyle = {
    display: 'flex',
    flexDirection: layoutStyle === 'list' ? 'column' : 'row',
    flexWrap: layoutStyle !== 'list' ? 'wrap' : undefined,
    gap: layoutStyle === 'grid' ? density.gap : layoutStyle === 'list' ? density.gap : 16,
  };

  if (layoutStyle === 'grid') {
    contentStyle.display = 'grid';
    contentStyle.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  }

  if (layoutStyle === 'card') {
    contentStyle.flexDirection = 'column';
  }

  return (
    _jsxs('div', { style: { padding: '14px', backgroundColor: bgColor, minHeight: '100vh', fontFamily: 'system-ui, sans-serif', overflowX: 'hidden' }, children: [
      _jsx('style', { children: `
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `})

      /* ===== 🌐 全局配置区域（来自 project.config.schema.json，影响所有页面） ===== */
      , _jsxs('div', { style: {
        borderRadius: '12px', border: `2px solid ${primaryColor}44`,
        backgroundColor: cardBg, overflow: 'hidden', marginBottom: '20px',
        boxShadow: `0 3px 16px ${primaryColor}12`,
      }, children: [
        /* 标题栏 */
        _jsxs('div', { style: {
          padding: '10px 16px',
          background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
          display: 'flex', alignItems: 'center', gap: '8px',
        }, children: [
          _jsx('span', { style: { fontSize: '16px' }, children: "🌐"})
          , _jsx('span', { style: { color: '#fff', fontWeight: 700, fontSize: '14px' }, children: "全局配置"})
          , _jsx('span', { style: { color: '#ffffffaa', fontSize: '11px' }, children: "— project.config.schema.json · 注入所有页面"   })
        ]})

        /* 全局配置字段网格 */
        , _jsxs('div', { style: { padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }, children: [
          /* brandName */
          _jsxs('div', { children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }, children: [
              _jsx('span', { style: { fontSize: '9px', fontWeight: 700, color: '#6366f1' }, children: "STRING"})
              , _jsx('span', { style: { fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"})
            ]})
            , _jsx('div', { style: { fontSize: '10px', color: mutedColor }, children: "brandName"})
            , _jsx('div', { style: { fontSize: '13px', fontWeight: 600, color: textColor }, children: brandName})
          ]})
          /* primaryColor */
          , _jsxs('div', { children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }, children: [
              _jsx('span', { style: { fontSize: '9px', fontWeight: 700, color: '#ec4899' }, children: "COLOR"})
              , _jsx('span', { style: { fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"})
            ]})
            , _jsx('div', { style: { fontSize: '10px', color: mutedColor }, children: "primaryColor"})
            , _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              _jsx('span', { style: { width: '16px', height: '16px', borderRadius: '4px', backgroundColor: primaryColor, border: '1px solid ' + borderColor, display: 'inline-block' },} )
              , _jsx('span', { style: { fontSize: '12px', fontWeight: 600, color: textColor }, children: primaryColor})
            ]})
          ]})
          /* darkMode */
          , _jsxs('div', { children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }, children: [
              _jsx('span', { style: { fontSize: '9px', fontWeight: 700, color: '#f59e0b' }, children: "BOOLEAN"})
              , _jsx('span', { style: { fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"})
            ]})
            , _jsx('div', { style: { fontSize: '10px', color: mutedColor }, children: "darkMode"})
            , _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              _jsx('span', { style: {
                display: 'inline-flex', alignItems: 'center', width: '28px', height: '16px',
                borderRadius: '8px', backgroundColor: darkMode ? primaryColor : '#cbd5e1',
                position: 'relative', transition: 'all 0.3s',
              }, children: 
                _jsx('span', { style: {
                  position: 'absolute', width: '12px', height: '12px', borderRadius: '50%',
                  backgroundColor: '#fff', top: '2px',
                  left: darkMode ? '14px' : '2px', transition: 'all 0.3s',
                },} )
              })
              , _jsx('span', { style: { fontSize: '12px', fontWeight: 600, color: textColor }, children: 
                darkMode ? '深色' : '浅色'
              })
            ]})
          ]})
          /* companySlogan */
          , _jsxs('div', { children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }, children: [
              _jsx('span', { style: { fontSize: '9px', fontWeight: 700, color: '#6366f1' }, children: "STRING"})
              , _jsx('span', { style: { fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"})
            ]})
            , _jsx('div', { style: { fontSize: '10px', color: mutedColor }, children: "companySlogan"})
            , _jsx('div', { style: { fontSize: '13px', fontWeight: 600, color: textColor }, children: companySlogan})
          ]})
        ]})
      ]})

      /* ===== 📄 页面级配置区域 ===== */
      , _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }, children: [
        _jsx('span', { style: { fontSize: '14px' }, children: "📄"})
        , _jsx('span', { style: { fontSize: '13px', fontWeight: 600, color: textColor }, children: "页面级配置"})
        , _jsx('span', { style: { fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#22c55e18', color: '#22c55e', fontWeight: 600 }, children: "仅本页"

        })
      ]})
      , _jsx('h1', { style: { fontSize: '20px', fontWeight: 700, color: textColor, margin: '2px 0 2px' }, children: "配置展示 · 样式布局类"  })
      , _jsx('p', { style: { fontSize: '12px', color: mutedColor, margin: '0 0 12px', lineHeight: '1.5' }, children: "调整右侧配置面板，实时预览样式与布局变化"

      })

      /* 页面级配置类型标签 */
      , _jsx('div', { style: { display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }, children: 
        [
          { label: 'enum · 布局', color: '#3b82f6' },
          { label: 'enum · 边框', color: '#22c55e' },
          { label: 'enum · 密度', color: '#f59e0b' },
          { label: 'boolean · 开关', color: '#ec4899' },
          { label: 'number · 滑块', color: '#8b5cf6' },
        ].map((badge) => (
          _jsx('span', { style: { padding: '2px 8px', borderRadius: '999px', fontSize: '9px', fontWeight: 600, backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }, children: 
            badge.label
          }, badge.label)
        ))
      })

      /* 当前配置预览 */
      , _jsxs('div', { style: { display: 'flex', gap: '4px', marginBottom: '12px', padding: '8px 12px', backgroundColor: sectionBg, borderRadius: '8px', flexWrap: 'wrap', fontSize: '10px', color: mutedColor }, children: [
        _jsx('span', { style: { fontWeight: 600, color: textColor, marginRight: '2px' }, children: "当前："})
        , _jsxs('span', { style: { backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }, children: ["布局: " , layoutStyle]})
        , _jsxs('span', { style: { backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }, children: ["圆角: " , roundedLevel]})
        , _jsxs('span', { style: { backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }, children: ["边框: " , showBorder ? borderStyle : '无']})
        , _jsxs('span', { style: { backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }, children: ["密度: " , contentDensity]})
        , _jsxs('span', { style: { backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }, children: ["动画: " , animationEnabled ? `${animationDuration}ms` : '关闭']})
      ]})

      /* 内容卡片 */
      , _jsx('div', { style: contentStyle, children: 
        ITEMS.map((item, index) => {
          if (layoutStyle === 'card') {
            return (
              _jsxs('div', {

                style: {
                  ...getCardStyle(index),
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                },
                onMouseEnter: (e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                    e.currentTarget.style.boxShadow = darkMode ? '0 10px 24px rgba(0,0,0,0.5)' : '0 10px 24px rgba(0,0,0,0.1)';
                  }
                },
                onMouseLeave: (e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                },
 children: [
                _jsx('div', { style: { fontSize: '32px', marginBottom: '6px' }, children: item.icon})
                , _jsx('h3', { style: { fontSize: density.titleSize, fontWeight: 600, color: textColor, margin: '0 0 3px' }, children: item.title})
                , _jsx('p', { style: { fontSize: density.descSize, color: mutedColor, margin: 0, lineHeight: '1.5' }, children: item.desc})
              ]}, index)
            );
          }
          if (layoutStyle === 'list') {
            return (
              _jsxs('div', {

                style: {
                  ...getCardStyle(index),
                  display: 'flex', alignItems: 'center', gap: '12px',
                },
                onMouseEnter: (e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateX(3px)';
                    e.currentTarget.style.boxShadow = darkMode ? '0 3px 12px rgba(0,0,0,0.4)' : '0 3px 12px rgba(0,0,0,0.06)';
                  }
                },
                onMouseLeave: (e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                },
 children: [
                _jsx('div', { style: { fontSize: '24px', flexShrink: 0 }, children: item.icon})
                , _jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
                  _jsx('h3', { style: { fontSize: density.titleSize, fontWeight: 600, color: textColor, margin: '0 0 2px' }, children: item.title})
                  , _jsx('p', { style: { fontSize: density.descSize, color: mutedColor, margin: 0 }, children: item.desc})
                ]})
                , _jsx('div', { style: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 },} )
              ]}, index)
            );
          }
          // Grid (default)
          return (
            _jsxs('div', {

              style: getCardStyle(index),
              onMouseEnter: (e) => {
                if (animationEnabled) {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = darkMode ? '0 10px 24px rgba(0,0,0,0.5)' : '0 10px 24px rgba(0,0,0,0.1)';
                }
              },
              onMouseLeave: (e) => {
                if (animationEnabled) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              },
 children: [
              _jsx('div', { style: { fontSize: '28px', marginBottom: '6px' }, children: item.icon})
              , _jsx('h3', { style: { fontSize: density.titleSize, fontWeight: 600, color: textColor, margin: '0 0 3px' }, children: item.title})
              , _jsx('p', { style: { fontSize: density.descSize, color: mutedColor, margin: 0, lineHeight: '1.5' }, children: item.desc})
            ]}, index)
          );
        })
      })

      /* Footer 全局配置 */
      , _jsxs('div', { style: { marginTop: '20px', textAlign: 'center', padding: '10px', borderTop: `1px solid ${borderColor}`, fontSize: '11px', color: mutedColor }, children: [
        _jsx('span', { children: brandName})
        , _jsx('span', { style: { margin: '0 6px', color: borderColor }, children: "·"})
        , _jsx('span', { children: companySlogan})
        , _jsx('span', { style: { marginLeft: '6px', fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"})
      ]})

      /* 配置归属总览 */
      , _jsxs('div', { style: { marginTop: '16px', padding: '14px 16px', backgroundColor: sectionBg, borderRadius: '10px', border: `1px dashed ${borderColor}` }, children: [
        _jsx('div', { style: { fontSize: '12px', fontWeight: 600, color: textColor, marginBottom: '10px' }, children: "📋 本页配置归属总览" })
        , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }, children: [
          _jsxs('div', { children: [
            _jsx('div', { style: { color: primaryColor, fontWeight: 600, marginBottom: '3px' }, children: "🌐 全局配置（影响所有页面）— project.config.schema.json"  })
            , _jsxs('div', { style: { color: mutedColor, lineHeight: '1.8' }, children: [
              _jsx('code', { style: { color: textColor }, children: "brandName"}), " · "  , _jsx('code', { style: { color: textColor }, children: "primaryColor"}), " · "  , _jsx('code', { style: { color: textColor }, children: "darkMode"}), " · "  , _jsx('code', { style: { color: textColor }, children: "companySlogan"})
            ]})
          ]})
          , _jsxs('div', { children: [
            _jsx('div', { style: { color: '#22c55e', fontWeight: 600, marginBottom: '3px' }, children: "📄 页面级配置（仅本页）— config.schema.json"  })
            , _jsxs('div', { style: { color: mutedColor, lineHeight: '1.8' }, children: [
              _jsx('code', { style: { color: textColor }, children: "layoutStyle"}), " (enum) · "   , _jsx('code', { style: { color: textColor }, children: "animationEnabled"}), " (boolean) · "   , _jsx('code', { style: { color: textColor }, children: "animationDuration"}), " (number) · "   , _jsx('code', { style: { color: textColor }, children: "columns"}), " (number) · "   , _jsx('code', { style: { color: textColor }, children: "roundedLevel"}), " (enum) · "   , _jsx('code', { style: { color: textColor }, children: "showBorder"}), " (boolean) · "   , _jsx('code', { style: { color: textColor }, children: "borderStyle"}), " (enum) · "   , _jsx('code', { style: { color: textColor }, children: "contentDensity"}), " (enum)"
            ]})
          ]})
        ]})
      ]})
    ]})
  );
};

export default ConfigLayoutPage;
