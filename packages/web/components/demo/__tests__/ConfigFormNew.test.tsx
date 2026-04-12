import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigForm } from '../ConfigFormNew';

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

describe('ConfigFormNew', () => {
  it('应正确渲染配置表单', () => {
    render(
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
    render(
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
    render(
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

  it('应在 schema 无效时显示空状态', () => {
    render(
      <ConfigForm
        schema="invalid json"
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    expect(screen.getByText('暂无配置项')).toBeInTheDocument();
  });

  it('应使用卡片样式显示分组', () => {
    render(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    // 验证分组标题显示字段数量（可能有多个分组，使用 getAllByText）
    const fieldCounts = screen.getAllByText(/\d+ 字段/);
    expect(fieldCounts.length).toBeGreaterThan(0);
    
    // 验证分组使用卡片样式（通过检查 Card 组件的类名）
    const cards = document.querySelectorAll('.rounded-lg.border.bg-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('应显示滑块数值', () => {
    render(
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
    render(
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
});
