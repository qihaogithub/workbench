import { render, screen } from '@testing-library/react';
import { PreviewPanel } from '../PreviewPanel';

jest.mock('@codesandbox/sandpack-react', () => ({
  Sandpack: ({ files }: { files: Record<string, string> }) => (
    <div data-testid="sandpack-mock">
      <pre>{JSON.stringify(Object.keys(files), null, 2)}</pre>
    </div>
  ),
}));

describe('PreviewPanel', () => {
  const mockCode = `export default function Demo({ title }: { title: string }) { 
    return <h1>{title}</h1>; 
  }`;

  it('应正确渲染 Sandpack 容器', () => {
    render(
      <PreviewPanel code={mockCode} configData={{ title: 'Test' }} />
    );
    
    expect(screen.getByTestId('sandpack-mock')).toBeInTheDocument();
  });

  it('应正确注入文件', () => {
    render(
      <PreviewPanel code={mockCode} configData={{ title: 'Test' }} />
    );
    
    const pre = screen.getByText(/Demo\.tsx/);
    expect(pre).toBeInTheDocument();
  });

  it('应支持自定义 className', () => {
    render(
      <PreviewPanel 
        code={mockCode} 
        configData={{ title: 'Test' }} 
        className="custom-class"
      />
    );
    
    const container = document.querySelector('.custom-class');
    expect(container).toBeInTheDocument();
  });

  it('应支持 SDK 文件注入', () => {
    const sdkFiles = {
      '/sdk/utils.ts': 'export const format = (s: string) => s.toUpperCase();',
    };
    
    render(
      <PreviewPanel 
        code={mockCode} 
        configData={{ title: 'Test' }} 
        sdkFiles={sdkFiles}
      />
    );
    
    const pre = screen.getByText(/sdk\/utils\.ts/);
    expect(pre).toBeInTheDocument();
  });
});
