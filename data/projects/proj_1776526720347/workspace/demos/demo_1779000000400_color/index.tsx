import React from 'react';

type ImageEntry = string | { url: string; alt?: string };

function getImageUrl(item: ImageEntry): string {
  return typeof item === 'string' ? item : item.url;
}

export default function ColorDemo(props: Record<string, unknown>) {
  const globalPrimary = (props.primaryColor as string) || '#6366f1';
  const darkMode = (props.darkMode as boolean) ?? false;

  const primaryColorVal = (props.primaryColor as string) || '#6366f1';
  const secondaryColorVal = (props.secondaryColor as string) || '#ec4899';
  const backgroundColorVal = (props.backgroundColor as string) || '#f8fafc';
  const heroImage = (props.heroImage as string) || 'https://picsum.photos/seed/hero42/800/400';
  const galleryImages: ImageEntry[] = (props.galleryImages as ImageEntry[]) || [
    'https://picsum.photos/seed/gal1/300/200',
    'https://picsum.photos/seed/gal2/300/200',
    'https://picsum.photos/seed/gal3/300/200',
  ];

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';

  const Card = ({ label, type, value, children }: { label: string; type: string; value: string; children: React.ReactNode }) => (
    <div style={{ backgroundColor: cardBg, borderRadius: '12px', border: `1px solid ${borderColor}`, overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: globalPrimary }}>{type}</span>
        <span style={{ fontSize: '15px', fontWeight: 600, color: textColor }}>{label}</span>
        <span style={{ fontSize: '13px', fontFamily: 'monospace', color: mutedColor, marginLeft: 'auto' }}>{value}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bgColor, padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: textColor, marginBottom: '24px' }}>颜色与图片</h1>

      <Card label="primaryColor" type="color" value={primaryColorVal}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '10px', backgroundColor: primaryColorVal }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: primaryColorVal, color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600 }}>按钮</button>
            <div style={{ height: '6px', borderRadius: '3px', backgroundColor: borderColor, overflow: 'hidden', width: '150px' }}>
              <div style={{ width: '72%', height: '100%', borderRadius: '3px', backgroundColor: primaryColorVal }} />
            </div>
          </div>
        </div>
      </Card>

      <Card label="secondaryColor" type="color" value={secondaryColorVal}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '10px', backgroundColor: secondaryColorVal }} />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, backgroundColor: secondaryColorVal + '22', color: secondaryColorVal }}>标签</span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: secondaryColorVal, display: 'inline-block' }} />
            <span style={{ fontSize: '13px', color: textColor, textDecoration: 'underline', textDecorationColor: secondaryColorVal, textUnderlineOffset: '3px' }}>下划线</span>
          </div>
        </div>
      </Card>

      <Card label="backgroundColor" type="color" value={backgroundColorVal}>
        <div style={{ backgroundColor: backgroundColorVal, borderRadius: '8px', padding: '20px', border: `1px solid ${borderColor}` }}>
          <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>背景色预览</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#1e293b', color: '#f8fafc' }}>深色</span>
            <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#ffffff', color: '#1e293b', border: '1px solid #e2e8f0' }}>浅色</span>
          </div>
        </div>
      </Card>

      <Card label="heroImage" type="image" value={heroImage.length > 40 ? heroImage.substring(0, 40) + '...' : heroImage}>
        <img src={heroImage} alt="hero" style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px' }} />
      </Card>

      <Card label="galleryImages" type="imageList" value={`${galleryImages.length} 张`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
          {galleryImages.map((item, i) => (
            <img key={i} src={getImageUrl(item)} alt={`gallery-${i}`} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px' }} />
          ))}
        </div>
      </Card>
    </div>
  );
}
