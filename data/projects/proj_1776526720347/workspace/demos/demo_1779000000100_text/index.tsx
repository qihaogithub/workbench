import React from 'react';

interface DemoProps {
  mainTitle?: string;
  subtitle?: string;
  bodyText?: string;
  richContent?: string;
  customCSS?: string;
}

const TextDemo: React.FC<DemoProps> = (props) => {
  const globalProps = props as Record<string, unknown>;
  const primaryColor = (globalProps.primaryColor as string) || '#6366f1';
  const darkMode = (globalProps.darkMode as boolean) ?? false;

  const {
    mainTitle = '探索无限可能',
    subtitle = '用配置驱动你的创意',
    bodyText = '通过右侧配置面板修改文字内容，左侧实时预览效果。',
    richContent = '<h3>为什么选择我们？</h3><p><strong>灵活</strong>的配置方案，<em>轻松定制</em>每一个细节。</p>',
    customCSS = ".demo-box {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  padding: 16px;\n  border-radius: 12px;\n  color: white;\n}",
  } = props;

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const Card = ({ label, type, children }: { label: string; type: string; children: React.ReactNode }) => (
    <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: primaryColor }}>{type}</span>
        <span style={{ fontSize: '15px', fontWeight: 600, color: textColor }}>{label}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }}>文本输入</h1>

      <Card label="mainTitle" type="string">
        <div style={{ fontSize: '32px', fontWeight: 700, color: textColor }}>{mainTitle}</div>
      </Card>

      <Card label="subtitle" type="string · maxLength">
        <div style={{ fontSize: '18px', fontWeight: 500, color: mutedColor }}>{subtitle}</div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: subtitle.length > 50 ? '#ef4444' : mutedColor }}>{subtitle.length}/50</div>
      </Card>

      <Card label="bodyText" type="string">
        <div style={{ fontSize: '15px', lineHeight: '1.7', color: textColor }}>{bodyText}</div>
      </Card>

      <Card label="richContent" type="richtext">
        <div style={{ fontSize: '15px', lineHeight: '1.7', color: textColor }} dangerouslySetInnerHTML={{ __html: richContent }} />
      </Card>

      <Card label="customCSS" type="code">
        <div style={{ fontSize: '13px', fontFamily: 'monospace', color: mutedColor, whiteSpace: 'pre-wrap', backgroundColor: darkMode ? '#0d1117' : '#f6f8fa', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
          {customCSS}
        </div>
        <style>{customCSS}</style>
        <div className="demo-box" style={{ textAlign: 'center' }}>CSS 效果预览</div>
      </Card>
    </div>
  );
};

export default TextDemo;
