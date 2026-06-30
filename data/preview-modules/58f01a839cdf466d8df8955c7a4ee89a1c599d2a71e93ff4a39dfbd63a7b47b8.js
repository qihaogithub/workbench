import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from "http://localhost:3200/preview-runtime/vendor/react.js";






const DEFAULT_STATS = [
  { label: '活跃用户', value: 12847, unit: '人' },
  { label: '月营收', value: 89.5, unit: '万' },
  { label: '转化率', value: 3.42, unit: '%' },
  { label: '满意度', value: 97, unit: '%' },
];

const DEFAULT_FEATURES = [
  { icon: '🚀', title: '极速部署', desc: '一键发布，秒级上线' },
  { icon: '🎨', title: '可视化配置', desc: '所见即所得的编辑体验' },
  { icon: '🔒', title: '安全可靠', desc: '企业级安全保障' },
  { icon: '📊', title: '数据分析', desc: '实时数据洞察' },
  { icon: '🔄', title: '自动同步', desc: '多端数据实时同步' },
  { icon: '💡', title: '智能推荐', desc: 'AI 驱动的个性化推荐' },
];

const formatStatValue = (stat) => {
  if (stat.value == null) return '—';
  if (stat.value >= 10000) return `${(stat.value / 10000).toFixed(1)}万`;
  if (Number.isInteger(stat.value)) return stat.value.toLocaleString();
  return String(stat.value);
};

const ArrayDemo = (props) => {
  const globalProps = props ;
  const primaryColor = (globalProps.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((globalProps.darkMode ), () => ( false));

  const { stats = DEFAULT_STATS, features = DEFAULT_FEATURES } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const sectionBg = darkMode ? '#1a2332' : '#f1f5f9';

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }, children: [
      _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }, children: "数据列表"})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "array · stats"  })
        , _jsx('div', { style: { padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }, children: 
          stats.map((stat, index) => (
            _jsxs('div', { style: { padding: '16px', borderRadius: '10px', backgroundColor: sectionBg, borderLeft: `3px solid ${primaryColor}` }, children: [
              _jsx('div', { style: { fontSize: '28px', fontWeight: 700, color: primaryColor }, children: formatStatValue(stat)})
              , _jsx('div', { style: { fontSize: '13px', color: mutedColor, marginTop: '2px' }, children: stat.unit})
              , _jsx('div', { style: { fontSize: '13px', color: mutedColor, marginTop: '4px' }, children: stat.label})
            ]}, index)
          ))
        })
      ]})

      , _jsxs('div', { style: { backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden' }, children: [
        _jsx('div', { style: { padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, fontSize: '12px', fontWeight: 600, color: primaryColor }, children: "array · features"  })
        , _jsx('div', { style: { padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }, children: 
          features.map((feature, index) => (
            _jsxs('div', { style: { padding: '16px', borderRadius: '10px', backgroundColor: sectionBg, border: `1px solid ${borderColor}` }, children: [
              _jsx('div', { style: { fontSize: '24px', marginBottom: '8px' }, children: feature.icon})
              , _jsx('div', { style: { fontSize: '15px', fontWeight: 600, color: textColor, marginBottom: '4px' }, children: feature.title})
              , _jsx('div', { style: { fontSize: '13px', color: mutedColor }, children: feature.desc})
            ]}, index)
          ))
        })
      ]})
    ]})
  );
};

export default ArrayDemo;
