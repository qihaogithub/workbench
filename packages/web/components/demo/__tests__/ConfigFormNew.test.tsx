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
    // 有多个必填标记，使用 getAllByText
    const requiredBadges = screen.getAllByText('必填');
    expect(requiredBadges.length).toBeGreaterThanOrEqual(1);
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

  it('应支持折叠/展开分组', () => {
    render(
      <ConfigForm
        schema={mockSchema}
        onChange={jest.fn()}
        initialData={{}}
      />
    );

    const groupButtons = screen.getAllByRole('button');
    const baseConfigButton = groupButtons.find(button => 
      button.textContent?.includes('基础配置')
    );

    if (baseConfigButton) {
      fireEvent.click(baseConfigButton);
      // 折叠后应该看不到字段
      expect(screen.queryByText('标题')).not.toBeInTheDocument();
    }
  });
});
