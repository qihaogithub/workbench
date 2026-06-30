import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ConfigForm } from '@opencode-workbench/demo-ui';
import { TooltipProvider } from '@/components/ui/tooltip';

const mockSchema = JSON.stringify({
  type: 'object',
  properties: {
    title: {
      type: 'string',
      title: '标题',
      description: '请输入演示标题',
      default: '演示标题',
    },
    showHeader: {
      type: 'boolean',
      title: '显示头部',
      description: '是否显示组件头部',
      default: true,
    },
    themeColor: {
      type: 'string',
      title: '主题色',
      format: 'color',
      default: '#3b82f6',
    },
    fontSize: {
      type: 'number',
      title: '字体大小',
      description: '设置字体大小',
      minimum: 12,
      maximum: 32,
      default: 16,
    },
    layout: {
      type: 'string',
      title: '布局模式',
      enum: ['horizontal', 'vertical', 'grid'],
      enumNames: ['水平布局', '垂直布局', '网格布局'],
      default: 'horizontal',
    },
  },
  required: ['title', 'themeColor'],
});

const positionSchema = JSON.stringify({
  type: 'object',
  $demo: {
    orderable: ['header', 'content'],
    orderableHorizontal: ['navHome', 'navAbout'],
    previewSize: { width: 320, height: 240 },
    positionable: {
      items: ['badgeA', 'badgeB'],
      defaults: {
        badgeA: { x: 10, y: 20 },
        badgeB: { x: 60, y: 80 },
      },
    },
  },
  properties: {
    header: { type: 'string', title: '页头', default: 'Header' },
    content: { type: 'string', title: '内容', default: 'Content' },
    navHome: { type: 'string', title: '首页', default: '首页' },
    navAbout: { type: 'string', title: '关于', default: '关于' },
    badgeA: { type: 'string', title: '徽章A', default: 'A' },
    badgeB: { type: 'string', title: '徽章B', default: 'B' },
  },
});

function renderConfigForm(ui: ReactElement) {
  return render(
    <TooltipProvider>
      {ui}
    </TooltipProvider>,
  );
}

describe('ConfigFormNew', () => {
  it('应正确渲染配置表单', () => {
    renderConfigForm(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    expect(screen.getByText('基础配置')).toBeInTheDocument();
    expect(screen.getByText('显示选项')).toBeInTheDocument();
    expect(screen.getByText('颜色配置')).toBeInTheDocument();
    expect(screen.getByText('尺寸设置')).toBeInTheDocument();
  });

  it('应显示字段标题和必填标记', () => {
    renderConfigForm(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    expect(screen.getByText('标题')).toBeInTheDocument();
    // 必填标记现在使用红色星号 * 而不是 Badge "必填"
    const titleLabel = screen.getByText('标题').closest('label');
    expect(titleLabel).toHaveTextContent('*');
  });

  it('应处理配置变更', () => {
    const handleChange = jest.fn();
    renderConfigForm(
      <ConfigForm
        schema={mockSchema}
        onChange={handleChange}
        initialData={{ title: '初始标题' }}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    const titleInput = inputs.find(input => 
      input.closest('div')?.textContent?.includes('标题')
    );

    if (titleInput) {
      fireEvent.change(titleInput, { target: { value: '新标题' } });
      expect(handleChange).toHaveBeenCalled();
    }
  });

  it('等价 initialData 重新传入时不应触发额外状态合并', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { rerender } = renderConfigForm(
        <ConfigForm
          schema={mockSchema}
          onChange={jest.fn()}
          initialData={{ title: '初始标题' }}
        />,
      );

      consoleSpy.mockClear();

      rerender(
        <TooltipProvider>
          <ConfigForm
            schema={mockSchema}
            onChange={jest.fn()}
            initialData={{ title: '初始标题' }}
          />
        </TooltipProvider>,
      );

      const renderLogs = consoleSpy.mock.calls.filter(
        ([message]) => message === '[ConfigForm] Rendered with schema length:',
      );
      const mergeLogs = consoleSpy.mock.calls.filter(([message]) =>
        typeof message === 'string' &&
        message.startsWith('[ConfigForm] Merged formData after'),
      );

      expect(renderLogs).toHaveLength(1);
      expect(mergeLogs).toHaveLength(0);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('应在 schema 无效时显示空状态', () => {
    renderConfigForm(
      <ConfigForm
        schema="invalid json"
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    expect(screen.getByText('暂无配置项')).toBeInTheDocument();
  });

  it('应显示分组和字段数量徽标', () => {
    renderConfigForm(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    expect(screen.getByText('基础配置')).toBeInTheDocument();
    const countBadges = screen.getAllByText('1');
    expect(countBadges.length).toBeGreaterThan(0);
  });

  it('应显示滑块数值', () => {
    renderConfigForm(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{ fontSize: 16 }}
      />
    );

    // 滑块旁边应显示当前数值（字体大小字段）
    expect(screen.getByText('16px')).toBeInTheDocument();
  });

  it('应渲染开关组件而不显示开启/关闭文字', () => {
    renderConfigForm(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{ showHeader: true }}
      />
    );

    // 开关旁边不应再有"开启"或"关闭"文字
    expect(screen.queryByText('开启')).not.toBeInTheDocument();
    expect(screen.queryByText('关闭')).not.toBeInTheDocument();
    
    // 但应该有 Switch 组件（role="switch"）
    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
  });

  it('应渲染横向排序和元素定位控件，并同步位置输入变更', () => {
    const handleChange = jest.fn();

    renderConfigForm(
      <ConfigForm
        schema={positionSchema}
        onChange={handleChange}
        initialData={{
          __order: ['header', 'content'],
          __orderH: ['navHome', 'navAbout'],
          __positions: {
            badgeA: { x: 10, y: 20 },
            badgeB: { x: 60, y: 80 },
          },
        }}
      />,
    );

    expect(screen.getByText('组件排序')).toBeInTheDocument();
    expect(screen.getByText('横向排序')).toBeInTheDocument();
    expect(screen.getByText('元素定位')).toBeInTheDocument();
    expect(screen.getAllByText('首页').length).toBeGreaterThan(0);
    expect(screen.getAllByText('徽章A').length).toBeGreaterThan(0);

    const xInputs = screen.getAllByDisplayValue('10');
    fireEvent.change(xInputs[0], { target: { value: '35' } });

    expect(handleChange).toHaveBeenCalledWith({
      __positions: {
        badgeA: { x: 35, y: 20 },
        badgeB: { x: 60, y: 80 },
      },
    });
  });
});
