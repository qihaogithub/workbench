'use client';

import { Sandpack, SandpackPreview } from '@codesandbox/sandpack-react';
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
      <Sandpack
        template="react-ts"
        files={files}
        options={{
          showNavigator: false,
          showTabs: false,
          showLineNumbers: true,
          showInlineErrors: true,
          wrapContent: true,
          editorHeight: '100%',
          classes: {
            'sp-wrapper': 'h-full',
            'sp-layout': 'h-full',
            'sp-stack': 'h-full',
          },
        }}
      />
    </div>
  );
}
