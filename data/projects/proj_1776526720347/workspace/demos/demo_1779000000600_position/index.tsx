import React from 'react';

interface Props {
  heroSection?: string;
  featureSection?: string;
  testimonialSection?: string;
  navHome?: string;
  navProducts?: string;
  navAbout?: string;
  navContact?: string;
  badge1?: string;
  badge2?: string;
  badge3?: string;
  badge4?: string;
  logoImage?: string;
  __order?: string[];
  __orderH?: string[];
  __positions?: Record<string, { x: number; y: number }>;
}

const SECTION_COLORS: Record<string, string> = {
  heroSection: '#3b82f6',
  featureSection: '#22c55e',
  testimonialSection: '#f59e0b',
};

const BADGE_COLORS: Record<string, string> = {
  badge1: '#3b82f6',
  badge2: '#ec4899',
  badge3: '#8b5cf6',
  badge4: '#f59e0b',
};

const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  badge1: { x: 80, y: 50 },
  badge2: { x: 260, y: 50 },
  badge3: { x: 440, y: 50 },
  badge4: { x: 170, y: 170 },
  logoImage: { x: 500, y: 130 },
};

const PositionDemo: React.FC<Props> = (props) => {
  const globalProps = props as Record<string, unknown>;
  const primaryColor = (globalProps.primaryColor as string) || '#6366f1';
  const darkMode = (globalProps.darkMode as boolean) ?? false;

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

  const navData: Record<string, string> = { navHome, navProducts, navAbout, navContact };
  const sectionData: Record<string, string> = { heroSection, featureSection, testimonialSection };
  const badgeData: Record<string, string> = { badge1, badge2, badge3, badge4 };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }}>位置与排序</h1>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>orderableHorizontal · 横向排序</div>
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '12px', borderRadius: '8px', backgroundColor: sectionBg }}>
            {horizontalOrder.map((key, index) => (
              <span key={key} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, color: index === 0 ? '#fff' : textColor, backgroundColor: index === 0 ? primaryColor : (darkMode ? '#334155' : '#e2e8f0') }}>{navData[key]}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>orderable · 纵向排序</div>
        <div style={{ padding: '16px' }}>
          {verticalOrder.map((key, index) => {
            const color = SECTION_COLORS[key] || '#94a3b8';
            return (
              <div key={key} style={{ marginBottom: index < verticalOrder.length - 1 ? '10px' : '0', borderRadius: '8px', backgroundColor: sectionBg, borderLeft: `3px solid ${color}`, padding: '10px 14px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: textColor }}>{sectionData[key]}</span>
                <span style={{ fontSize: '11px', marginLeft: '8px', color: mutedColor }}>#{index + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>positionable · 自由坐标</div>
        <div style={{ padding: '16px' }}>
          <div style={{ position: 'relative', minHeight: '220px', backgroundColor: sectionBg, borderRadius: '10px', border: `2px dashed ${borderColor}`, overflow: 'hidden' }}>
            {Object.entries(badgeData).map(([key, text]) => {
              const pos = positions[key] || { x: 0, y: 0 };
              const color = BADGE_COLORS[key] || '#94a3b8';
              return (
                <div key={key} data-pos-key={key} style={{ position: 'absolute', left: pos.x, top: pos.y, padding: '5px 14px', borderRadius: '16px', fontSize: '12px', fontWeight: 700, color: '#fff', backgroundColor: color, whiteSpace: 'nowrap' }}>
                  {text} <span style={{ opacity: 0.7, fontSize: '10px' }}>({pos.x},{pos.y})</span>
                </div>
              );
            })}
            {logoImage && (
              <img
                data-pos-key="logoImage"
                src={logoImage}
                alt="Logo"
                style={{
                  position: 'absolute',
                  left: positions.logoImage?.x ?? 500,
                  top: positions.logoImage?.y ?? 130,
                  maxWidth: '120px',
                  maxHeight: '60px',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PositionDemo;
