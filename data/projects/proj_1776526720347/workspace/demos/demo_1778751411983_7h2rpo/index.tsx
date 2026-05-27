import React from 'react';

interface Props {
  layoutStyle?: 'grid' | 'list' | 'card';
  animationEnabled?: boolean;
  animationDuration?: number;
  columns?: number;
  roundedLevel?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showBorder?: boolean;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  contentDensity?: 'compact' | 'comfortable' | 'spacious';
}

const ITEMS = [
  { title: '响应式布局', desc: '自适应各种屏幕尺寸，完美呈现', icon: '📱', color: '#3b82f6' },
  { title: '流畅动画', desc: '顺滑的交互动画，提升体验', icon: '✨', color: '#22c55e' },
  { title: '暗色模式', desc: '护眼的深色主题，夜间友好', icon: '🌙', color: '#8b5cf6' },
  { title: '自定义主题', desc: '随心搭配颜色方案', icon: '🎨', color: '#ec4899' },
  { title: '组件丰富', desc: '内置大量精美可复用组件', icon: '🧩', color: '#f59e0b' },
  { title: '性能优越', desc: '极致优化的渲染性能', icon: '⚡', color: '#ef4444' },
];

const ROUNDED_MAP: Record<string, number> = {
  none: 0, sm: 4, md: 8, lg: 12, xl: 20, full: 9999,
};

const DENSITY_MAP: Record<string, { cardPadding: number; gap: number; titleSize: number; descSize: number }> = {
  compact: { cardPadding: 10, gap: 8, titleSize: 13, descSize: 11 },
  comfortable: { cardPadding: 16, gap: 12, titleSize: 15, descSize: 12 },
  spacious: { cardPadding: 22, gap: 16, titleSize: 17, descSize: 13 },
};

const ConfigLayoutPage: React.FC<Props> = (props) => {
  const globalProps = props as Record<string, unknown>;
  const brandName = (globalProps.brandName as string) || 'OpenCode Workbench';
  const primaryColor = (globalProps.primaryColor as string) || '#6366f1';
  const darkMode = (globalProps.darkMode as boolean) ?? false;
  const companySlogan = (globalProps.companySlogan as string) || '用配置驱动一切';

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

  const getCardStyle = (index: number): React.CSSProperties => {
    const base: React.CSSProperties = {
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

  const contentStyle: React.CSSProperties = {
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
    <div style={{ padding: '14px', backgroundColor: bgColor, minHeight: '100vh', fontFamily: 'system-ui, sans-serif', overflowX: 'hidden' }}>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ===== 🏷️ 顶部大标题 ===== */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 800, color: textColor, margin: '0', letterSpacing: '2px' }}>
          配置项示例
        </h1>
        <div style={{ width: '60px', height: '4px', borderRadius: '2px', background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}88)`, margin: '10px auto 0' }} />
      </div>

      {/* ===== 🌐 全局配置区域（来自 project.config.schema.json，影响所有页面） ===== */}
      <div style={{
        borderRadius: '12px', border: `2px solid ${primaryColor}44`,
        backgroundColor: cardBg, overflow: 'hidden', marginBottom: '20px',
        boxShadow: `0 3px 16px ${primaryColor}12`,
      }}>
        {/* 标题栏 */}
        <div style={{
          padding: '10px 16px',
          background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>🌐</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>全局配置</span>
          <span style={{ color: '#ffffffaa', fontSize: '11px' }}>— project.config.schema.json · 注入所有页面</span>
        </div>

        {/* 全局配置字段网格 */}
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* brandName */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#6366f1' }}>STRING</span>
              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }}>全局</span>
            </div>
            <div style={{ fontSize: '10px', color: mutedColor }}>brandName</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: textColor }}>{brandName}</div>
          </div>
          {/* primaryColor */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#ec4899' }}>COLOR</span>
              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }}>全局</span>
            </div>
            <div style={{ fontSize: '10px', color: mutedColor }}>primaryColor</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: primaryColor, border: '1px solid ' + borderColor, display: 'inline-block' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: textColor }}>{primaryColor}</span>
            </div>
          </div>
          {/* darkMode */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#f59e0b' }}>BOOLEAN</span>
              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }}>全局</span>
            </div>
            <div style={{ fontSize: '10px', color: mutedColor }}>darkMode</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', width: '28px', height: '16px',
                borderRadius: '8px', backgroundColor: darkMode ? primaryColor : '#cbd5e1',
                position: 'relative', transition: 'all 0.3s',
              }}>
                <span style={{
                  position: 'absolute', width: '12px', height: '12px', borderRadius: '50%',
                  backgroundColor: '#fff', top: '2px',
                  left: darkMode ? '14px' : '2px', transition: 'all 0.3s',
                }} />
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: textColor }}>
                {darkMode ? '深色' : '浅色'}
              </span>
            </div>
          </div>
          {/* companySlogan */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#6366f1' }}>STRING</span>
              <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }}>全局</span>
            </div>
            <div style={{ fontSize: '10px', color: mutedColor }}>companySlogan</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: textColor }}>{companySlogan}</div>
          </div>
        </div>
      </div>

      {/* ===== 📄 页面级配置区域 ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
        <span style={{ fontSize: '14px' }}>📄</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: textColor }}>页面级配置</span>
        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#22c55e18', color: '#22c55e', fontWeight: 600 }}>
          仅本页
        </span>
      </div>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: textColor, margin: '2px 0 2px' }}>配置展示 · 样式布局类</h1>
      <p style={{ fontSize: '12px', color: mutedColor, margin: '0 0 12px', lineHeight: '1.5' }}>
        调整右侧配置面板，实时预览样式与布局变化
      </p>

      {/* 页面级配置类型标签 */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'enum · 布局', color: '#3b82f6' },
          { label: 'enum · 边框', color: '#22c55e' },
          { label: 'enum · 密度', color: '#f59e0b' },
          { label: 'boolean · 开关', color: '#ec4899' },
          { label: 'number · 滑块', color: '#8b5cf6' },
        ].map((badge) => (
          <span key={badge.label} style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '9px', fontWeight: 600, backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }}>
            {badge.label}
          </span>
        ))}
      </div>

      {/* 当前配置预览 */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', padding: '8px 12px', backgroundColor: sectionBg, borderRadius: '8px', flexWrap: 'wrap', fontSize: '10px', color: mutedColor }}>
        <span style={{ fontWeight: 600, color: textColor, marginRight: '2px' }}>当前：</span>
        <span style={{ backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }}>布局: {layoutStyle}</span>
        <span style={{ backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }}>圆角: {roundedLevel}</span>
        <span style={{ backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }}>边框: {showBorder ? borderStyle : '无'}</span>
        <span style={{ backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }}>密度: {contentDensity}</span>
        <span style={{ backgroundColor: primaryColor + '22', padding: '1px 6px', borderRadius: '4px', color: primaryColor }}>动画: {animationEnabled ? `${animationDuration}ms` : '关闭'}</span>
      </div>

      {/* 内容卡片 */}
      <div style={contentStyle}>
        {ITEMS.map((item, index) => {
          if (layoutStyle === 'card') {
            return (
              <div
                key={index}
                style={{
                  ...getCardStyle(index),
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                    e.currentTarget.style.boxShadow = darkMode ? '0 10px 24px rgba(0,0,0,0.5)' : '0 10px 24px rgba(0,0,0,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '6px' }}>{item.icon}</div>
                <h3 style={{ fontSize: density.titleSize, fontWeight: 600, color: textColor, margin: '0 0 3px' }}>{item.title}</h3>
                <p style={{ fontSize: density.descSize, color: mutedColor, margin: 0, lineHeight: '1.5' }}>{item.desc}</p>
              </div>
            );
          }
          if (layoutStyle === 'list') {
            return (
              <div
                key={index}
                style={{
                  ...getCardStyle(index),
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}
                onMouseEnter={(e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateX(3px)';
                    e.currentTarget.style.boxShadow = darkMode ? '0 3px 12px rgba(0,0,0,0.4)' : '0 3px 12px rgba(0,0,0,0.06)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (animationEnabled) {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <div style={{ fontSize: '24px', flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: density.titleSize, fontWeight: 600, color: textColor, margin: '0 0 2px' }}>{item.title}</h3>
                  <p style={{ fontSize: density.descSize, color: mutedColor, margin: 0 }}>{item.desc}</p>
                </div>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
              </div>
            );
          }
          // Grid (default)
          return (
            <div
              key={index}
              style={getCardStyle(index)}
              onMouseEnter={(e) => {
                if (animationEnabled) {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = darkMode ? '0 10px 24px rgba(0,0,0,0.5)' : '0 10px 24px rgba(0,0,0,0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (animationEnabled) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>{item.icon}</div>
              <h3 style={{ fontSize: density.titleSize, fontWeight: 600, color: textColor, margin: '0 0 3px' }}>{item.title}</h3>
              <p style={{ fontSize: density.descSize, color: mutedColor, margin: 0, lineHeight: '1.5' }}>{item.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Footer 全局配置 */}
      <div style={{ marginTop: '20px', textAlign: 'center', padding: '10px', borderTop: `1px solid ${borderColor}`, fontSize: '11px', color: mutedColor }}>
        <span>{brandName}</span>
        <span style={{ margin: '0 6px', color: borderColor }}>·</span>
        <span>{companySlogan}</span>
        <span style={{ marginLeft: '6px', fontSize: '8px', padding: '1px 5px', borderRadius: '3px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }}>全局</span>
      </div>

      {/* 配置归属总览 */}
      <div style={{ marginTop: '16px', padding: '14px 16px', backgroundColor: sectionBg, borderRadius: '10px', border: `1px dashed ${borderColor}` }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: textColor, marginBottom: '10px' }}>📋 本页配置归属总览</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
          <div>
            <div style={{ color: primaryColor, fontWeight: 600, marginBottom: '3px' }}>🌐 全局配置（影响所有页面）— project.config.schema.json</div>
            <div style={{ color: mutedColor, lineHeight: '1.8' }}>
              <code style={{ color: textColor }}>brandName</code> · <code style={{ color: textColor }}>primaryColor</code> · <code style={{ color: textColor }}>darkMode</code> · <code style={{ color: textColor }}>companySlogan</code>
            </div>
          </div>
          <div>
            <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: '3px' }}>📄 页面级配置（仅本页）— config.schema.json</div>
            <div style={{ color: mutedColor, lineHeight: '1.8' }}>
              <code style={{ color: textColor }}>layoutStyle</code> (enum) · <code style={{ color: textColor }}>animationEnabled</code> (boolean) · <code style={{ color: textColor }}>animationDuration</code> (number) · <code style={{ color: textColor }}>columns</code> (number) · <code style={{ color: textColor }}>roundedLevel</code> (enum) · <code style={{ color: textColor }}>showBorder</code> (boolean) · <code style={{ color: textColor }}>borderStyle</code> (enum) · <code style={{ color: textColor }}>contentDensity</code> (enum)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigLayoutPage;
