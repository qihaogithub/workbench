import React from 'react';

interface Props {
  stats?: Array<{ label: string; value: number; unit: string }>;
  features?: Array<{ icon: string; title: string; desc: string }>;
}

const DEFAULT_STATS: Array<{ label: string; value: number; unit: string }> = [
  { label: '活跃用户', value: 12847, unit: '人' },
  { label: '月营收', value: 89.5, unit: '万' },
  { label: '转化率', value: 3.42, unit: '%' },
  { label: '满意度', value: 97, unit: '%' },
];

const DEFAULT_FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  { icon: '🚀', title: '极速部署', desc: '一键发布，秒级上线' },
  { icon: '🎨', title: '可视化配置', desc: '所见即所得的编辑体验' },
  { icon: '🔒', title: '安全可靠', desc: '企业级安全保障' },
  { icon: '📊', title: '数据分析', desc: '实时数据洞察' },
  { icon: '🔄', title: '自动同步', desc: '多端数据实时同步' },
  { icon: '💡', title: '智能推荐', desc: 'AI 驱动的个性化推荐' },
];

const formatStatValue = (stat: { label: string; value: number; unit: string }): string => {
  if (stat.value == null) return '—';
  if (stat.value >= 10000) return `${(stat.value / 10000).toFixed(1)}万`;
  if (Number.isInteger(stat.value)) return stat.value.toLocaleString();
  return String(stat.value);
};

const ArrayDemo: React.FC<Props> = (props) => {
  const globalProps = props as Record<string, unknown>;
  const primaryColor = (globalProps.primaryColor as string) || '#6366f1';
  const darkMode = (globalProps.darkMode as boolean) ?? false;

  const { stats = DEFAULT_STATS, features = DEFAULT_FEATURES } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const sectionBg = darkMode ? '#1a2332' : '#f1f5f9';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }}>数据列表</h1>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>array · stats</div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          {stats.map((stat, index) => (
            <div key={index} style={{ padding: '16px', borderRadius: '10px', backgroundColor: sectionBg, borderLeft: `3px solid ${primaryColor}` }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: primaryColor }}>{formatStatValue(stat)}</div>
              <div style={{ fontSize: '13px', color: mutedColor, marginTop: '2px' }}>{stat.unit}</div>
              <div style={{ fontSize: '13px', color: mutedColor, marginTop: '4px' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }}>array · features</div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
          {features.map((feature, index) => (
            <div key={index} style={{ padding: '16px', borderRadius: '10px', backgroundColor: sectionBg, border: `1px solid ${borderColor}` }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{feature.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: textColor, marginBottom: '4px' }}>{feature.title}</div>
              <div style={{ fontSize: '13px', color: mutedColor }}>{feature.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ArrayDemo;
