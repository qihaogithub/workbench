import React from 'react';

interface DemoProps {
  cardCount?: number;
  fontSize?: number;
  borderWidth?: number;
  spacing?: number;
  opacity?: number;
  priority?: number;
}

const EMOJIS = ['🚀', '🎨', '💡', '📊', '🔒', '🔄', '⭐', '🎯', '🎪', '🌈', '🎸', '🎵'];

const NumberDemo: React.FC<DemoProps> = (props) => {
  const globalProps = props as Record<string, unknown>;
  const primaryColor = (globalProps.primaryColor as string) || '#6366f1';
  const darkMode = (globalProps.darkMode as boolean) ?? false;

  const { cardCount = 6, fontSize = 20, borderWidth = 2, spacing = 20, opacity = 100, priority = 3 } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const Card = ({ label, type, value, children }: { label: string; type: string; value: string; children: React.ReactNode }) => (
    <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: primaryColor }}>{type}</span>
        <span style={{ fontSize: '15px', fontWeight: 600, color: textColor }}>{label}</span>
        <span style={{ fontSize: '13px', color: mutedColor, marginLeft: 'auto' }}>{value}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }}>数字与范围</h1>

      <Card label="cardCount" type="number" value={`${cardCount}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' }}>
          {Array.from({ length: cardCount }, (_, i) => (
            <div key={i} style={{ backgroundColor: darkMode ? '#1a2332' : '#f1f5f9', border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px' }}>{EMOJIS[i % EMOJIS.length]}</div>
              <div style={{ fontSize: '11px', color: mutedColor, marginTop: '4px' }}>#{i + 1}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card label="fontSize" type="number" value={`${fontSize}px`}>
        <span style={{ fontSize: `${fontSize}px`, fontWeight: 600, color: textColor }}>字体大小预览</span>
      </Card>

      <Card label="borderWidth" type="number" value={`${borderWidth}px`}>
        <div style={{ width: '100px', height: '100px', border: `${borderWidth}px solid ${primaryColor}`, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mutedColor, fontSize: '13px' }}>
          边框 {borderWidth}px
        </div>
      </Card>

      <Card label="spacing" type="number" value={`${spacing}px`}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: primaryColor, marginLeft: i === 0 ? 0 : `${spacing}px` }} />
          ))}
        </div>
      </Card>

      <Card label="opacity" type="number" value={`${opacity}%`}>
        <div style={{ width: '120px', height: '80px', background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}88)`, borderRadius: '10px', opacity: opacity / 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: '14px' }}>
          {opacity}% 不透明度
        </div>
      </Card>

      <Card label="priority" type="integer" value={`${priority}`}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: primaryColor, color: '#fff', fontWeight: 700, fontSize: '28px' }}>
          {priority}
        </div>
      </Card>
    </div>
  );
};

export default NumberDemo;
