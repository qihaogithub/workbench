'use client';

import { SandpackProvider, SandpackLayout, SandpackPreview } from '@codesandbox/sandpack-react';
import type { PreviewPanelProps } from './types';

export function PreviewPanel({
  code,
  configData,
  sdkFiles,
  onError,
  className,
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
            style={{ height: '100%', width: '100%' }}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
