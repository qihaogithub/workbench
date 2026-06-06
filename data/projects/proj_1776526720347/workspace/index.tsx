import React from 'react';

interface Props {
  heroTitle?: string;
  heroDescription?: string;
}

const PAGES = [
  { id: 'demo_1779000000100_text', name: '文本输入', icon: '📝', desc: 'string · richtext · code', color: '#3b82f6' },
  { id: 'demo_1779000000200_number', name: '数字与范围', icon: '🔢', desc: 'number · integer', color: '#22c55e' },
  { id: 'demo_1779000000300_switch', name: '开关与选择', icon: '🔘', desc: 'boolean · enum', color: '#f59e0b' },
  { id: 'demo_1779000000400_color', name: '颜色与图片', icon: '🎨', desc: 'color · image · imageList', color: '#a855f7' },
  { id: 'demo_1779000000500_array', name: '数据列表', icon: '📊', desc: 'array · 对象数组', color: '#f97316' },
  { id: 'demo_1779000000600_position', name: '位置与排序', icon: '📍', desc: 'orderable · positionable', color: '#ec4899' },
];

const LandingPage: React.FC<Props> = (props) => {
  const globalProps = props as Record<string, unknown>;
  const brandName = (globalProps.brandName as string) || 'OpenCode Workbench';
  const primaryColor = (globalProps.primaryColor as string) || '#6366f1';
  const darkMode = (globalProps.darkMode as boolean) ?? false;
  const companySlogan = (globalProps.companySlogan as string) || '用配置驱动一切';

  const {
    heroTitle = '配置项示例',
    heroDescription = '本演示项目展示配置面板支持的所有配置项类型，点击下方卡片进入对应分类页面',
  } = props;

  const bg = darkMode ? '#0f172a' : '#f8fafc';
  const text = darkMode ? '#f1f5f9' : '#1e293b';
  const muted = darkMode ? '#64748b' : '#94a3b8';
  const card = darkMode ? '#1e293b' : '#ffffff';
  const border = darkMode ? '#334155' : '#e2e8f0';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 48px' }}>
        <div style={{
          display: 'inline-block', padding: '6px 16px', borderRadius: '20px',
          backgroundColor: primaryColor + '18', color: primaryColor,
          fontSize: '14px', fontWeight: 600, marginBottom: '20px',
        }}>
          演示项目
        </div>
        <h1 style={{ fontSize: '40px', fontWeight: 800, color: text, margin: '0 0 16px', lineHeight: '1.2' }}>
          {heroTitle}
        </h1>
        <p style={{ fontSize: '18px', color: muted, margin: 0, lineHeight: '1.6' }}>
          {heroDescription}
        </p>
      </div>

      {/* Global config indicator */}
      <div style={{
        maxWidth: '700px', margin: '0 auto 40px', padding: '16px 20px',
        borderRadius: '12px', border: `1px solid ${primaryColor}33`,
        backgroundColor: card, display: 'flex', gap: '20px',
        flexWrap: 'wrap', alignItems: 'center', fontSize: '14px',
      }}>
        <span style={{ color: primaryColor, fontWeight: 600 }}>🌐 全局配置生效中</span>
        <span style={{ color: muted }}>{brandName}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: muted }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: primaryColor, display: 'inline-block' }} />
          {primaryColor}
        </span>
        <span style={{ color: muted }}>{darkMode ? '深色' : '浅色'}模式</span>
        <span style={{ color: muted }}>{companySlogan}</span>
      </div>

      {/* Page cards grid */}
      <div style={{
        maxWidth: '700px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        {PAGES.map((page) => (
          <div
            key={page.id}
            style={{
              backgroundColor: card, borderRadius: '16px',
              border: `1px solid ${border}`, padding: '24px',
              cursor: 'pointer', transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = `0 8px 24px ${page.color}22`;
              e.currentTarget.style.borderColor = page.color + '66';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = border;
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>{page.icon}</div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: text, margin: '0 0 6px' }}>{page.name}</h3>
            <p style={{ fontSize: '13px', color: muted, margin: 0 }}>{page.desc}</p>
            <div style={{
              marginTop: '12px', padding: '4px 10px', borderRadius: '6px',
              backgroundColor: page.color + '15', color: page.color,
              fontSize: '11px', fontWeight: 600, display: 'inline-block',
            }}>
              点击查看 →
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '32px 0 0', fontSize: '14px', color: muted, marginTop: '48px' }}>
        <span>{brandName}</span>
        <span style={{ margin: '0 8px', color: border }}>·</span>
        <span>{companySlogan}</span>
      </div>
    </div>
  );
};

export default LandingPage;
