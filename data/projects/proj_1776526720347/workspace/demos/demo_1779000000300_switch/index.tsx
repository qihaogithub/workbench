import React from 'react';

export default function SwitchDemo(props: Record<string, unknown>) {
  const primaryColor = (props.primaryColor as string) || '#6366f1';
  const darkMode = (props.darkMode as boolean) ?? false;

  const showHeader = (props.showHeader as boolean) ?? true;
  const showSidebar = (props.showSidebar as boolean) ?? true;
  const showFooter = (props.showFooter as boolean) ?? true;
  const enableShadow = (props.enableShadow as boolean) ?? true;
  const layout = (props.layout as string) || 'grid';
  const theme = (props.theme as string) || 'light';
  const cardSize = (props.cardSize as string) || 'medium';

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const miniTheme = theme === 'dark' ? { bg: '#1e293b', text: '#f1f5f9', card: '#334155', muted: '#94a3b8', border: '#475569' }
    : theme === 'ocean' ? { bg: '#0c4a6e', text: '#e0f2fe', card: '#075985', muted: '#7dd3fc', border: '#0369a1' }
    : { bg: '#ffffff', text: '#1e293b', card: '#f8fafc', muted: '#64748b', border: '#e2e8f0' };

  const cardSizeMap: Record<string, { padding: string; fontSize: string }> = {
    small: { padding: '8px', fontSize: '11px' },
    medium: { padding: '14px', fontSize: '13px' },
    large: { padding: '20px', fontSize: '15px' },
  };
  const sz = cardSizeMap[cardSize] || cardSizeMap.medium;

  const layoutStyle: React.CSSProperties =
    layout === 'list' ? { display: 'flex', flexDirection: 'column', gap: '8px' }
    : { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' };

  const ToggleRow = ({ label, value }: { label: string; value: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
      <div style={{ width: '36px', height: '20px', borderRadius: '10px', backgroundColor: value ? primaryColor : borderColor, position: 'relative' }}>
        <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: value ? '18px' : '2px', transition: 'left 0.2s' }} />
      </div>
      <span style={{ fontSize: '14px', color: textColor }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: value ? '#22c55e' : '#ef4444', marginLeft: 'auto' }}>{value ? 'ON' : 'OFF'}</span>
    </div>
  );

  const SelectRow = ({ label, value, options }: { label: string; value: string; options: string[] }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
      <span style={{ fontSize: '14px', color: textColor }}>{label}</span>
      <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
        {options.map((opt) => (
          <span key={opt} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, backgroundColor: opt === value ? primaryColor + '22' : 'transparent', color: opt === value ? primaryColor : mutedColor, border: opt === value ? `1px solid ${primaryColor}44` : `1px solid ${borderColor}` }}>{opt}</span>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }}>开关与选择</h1>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>boolean</div>
        <div style={{ padding: '16px 20px' }}>
          <ToggleRow label="showHeader" value={showHeader} />
          <ToggleRow label="showSidebar" value={showSidebar} />
          <ToggleRow label="showFooter" value={showFooter} />
          <ToggleRow label="enableShadow" value={enableShadow} />
        </div>
      </div>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>enum</div>
        <div style={{ padding: '16px 20px' }}>
          <SelectRow label="layout" value={layout} options={['grid', 'list', 'masonry']} />
          <SelectRow label="theme" value={theme} options={['light', 'dark', 'ocean']} />
          <SelectRow label="cardSize" value={cardSize} options={['small', 'medium', 'large']} />
        </div>
      </div>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: mutedColor }}>预览效果</div>
        <div style={{ padding: '16px' }}>
          <div style={{ borderRadius: '10px', border: `1px solid ${borderColor}`, overflow: 'hidden', backgroundColor: miniTheme.bg }}>
            {showHeader && (
              <div style={{ height: '40px', backgroundColor: primaryColor, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '20px' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}>MyApp</span>
                <span style={{ color: '#ffffffcc', fontSize: '12px' }}>首页</span>
                <span style={{ color: '#ffffffcc', fontSize: '12px' }}>产品</span>
              </div>
            )}
            <div style={{ display: 'flex', minHeight: '120px' }}>
              {showSidebar && (
                <div style={{ width: '100px', backgroundColor: miniTheme.card, borderRight: `1px solid ${miniTheme.border}`, padding: '10px', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', padding: '4px 6px', borderRadius: '4px', backgroundColor: primaryColor + '22', color: primaryColor, fontWeight: 600 }}>📊 仪表盘</div>
                  <div style={{ fontSize: '11px', padding: '4px 6px', color: miniTheme.muted }}>📁 项目</div>
                </div>
              )}
              <div style={{ flex: 1, padding: '12px' }}>
                <div style={layoutStyle}>
                  {['📄 文档', '📊 报表', '🔔 通知', '👤 设置'].map((t) => (
                    <div key={t} style={{ backgroundColor: miniTheme.card, borderRadius: '6px', border: `1px solid ${miniTheme.border}`, padding: sz.padding, fontSize: sz.fontSize, color: miniTheme.text, boxShadow: enableShadow ? '0 2px 6px rgba(0,0,0,0.1)' : 'none' }}>{t}</div>
                  ))}
                </div>
              </div>
            </div>
            {showFooter && (
              <div style={{ height: '30px', backgroundColor: miniTheme.card, borderTop: `1px solid ${miniTheme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: miniTheme.muted }}>© 2026 MyApp</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
