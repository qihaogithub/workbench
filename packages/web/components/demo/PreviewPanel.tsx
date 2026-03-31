'use client';

import { SandpackProvider, SandpackLayout, SandpackPreview } from '@codesandbox/sandpack-react';
import type { PreviewPanelProps, PreviewSize } from './types';

function buildPreviewStyle(size?: PreviewSize): React.CSSProperties {
  if (!size) {
    return { height: '100%', minHeight: '400px', width: '100%' };
  }

  const style: React.CSSProperties = {
    width: size.width ?? '100%',
    height: size.height ?? '100%',
    minHeight: size.minHeight ?? '400px',
  };

  if (size.maxHeight !== undefined) {
    style.maxHeight = size.maxHeight;
  }

  return style;
}

export function PreviewPanel({
  code,
  configData,
  sdkFiles,
  onError,
  className,
  previewSize,
}: PreviewPanelProps) {
  const entryCode = `
import Demo from './Demo';
export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`;

  const files: Record<string, string> = {
    '/Demo.tsx': code,
    '/App.tsx': entryCode,
    ...sdkFiles,
  };

  const previewStyle = buildPreviewStyle(previewSize);

  return (
    <div className={className || 'h-full w-full'}>
      <SandpackProvider
        template="react-ts"
        files={files}
        customSetup={{
          dependencies: {
            'react': '^18.0.0',
            'react-dom': '^18.0.0',
          },
        }}
        theme={{
          colors: {
            surface1: '#ffffff',
            surface2: '#f7f7f7',
            surface3: '#e8e8e8',
          },
        }}
      >
        <SandpackLayout>
          <SandpackPreview
            showNavigator={false}
            showRefreshButton={true}
            style={previewStyle}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
