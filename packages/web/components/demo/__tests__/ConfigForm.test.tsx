import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigForm } from '../ConfigForm';

jest.mock('@rjsf/core', () => {
  return function MockForm({ 
    schema, 
    formData, 
    onChange, 
    readonly 
  }: { 
    schema: any; 
    formData?: any; 
    onChange?: (e: any) => void;
    readonly?: boolean;
  }) {
    return (
      <form data-testid="rjsf-form-mock">
        {schema?.properties && Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
          if (prop.enum) {
            return (
              <select
                key={key}
                aria-label={prop.title}
                disabled={readonly}
                value={formData?.[key] || ''}
                onChange={(e) => onChange?.({ formData: { ...formData, [key]: e.target.value } })}
              >
                {prop.enum.map((val: string) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            );
          }
          
          if (prop.type === 'boolean') {
            return (
              <input
                key={key}
                type="checkbox"
                aria-label={prop.title}
                disabled={readonly}
                checked={formData?.[key] || false}
                onChange={(e) => onChange?.({ formData: { ...formData, [key]: e.target.checked } })}
              />
            );
          }
          
          return (
            <input
              key={key}
              type="text"
              aria-label={prop.title}
              disabled={readonly}
              value={formData?.[key] || ''}
              onChange={(e) => onChange?.({ formData: { ...formData, [key]: e.target.value } })}
            />
          );
        })}
        <button type="submit">Submit</button>
      </form>
    );
  };
});

jest.mock('@rjsf/validator-ajv8', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('ConfigForm', () => {
  const basicSchema = JSON.stringify({
    type: 'object',
    properties: {
      title: { type: 'string', title: '标题' },
    },
  });

  it('应根据 schema 生成表单', () => {
    render(<ConfigForm schema={basicSchema} onChange={() => {}} />);
    
    expect(screen.getByLabelText('标题')).toBeInTheDocument();
  });

  it('应在变更时触发 onChange', async () => {
    const onChange = jest.fn();
    render(<ConfigForm schema={basicSchema} onChange={onChange} />);
    
    const input = screen.getByLabelText('标题');
    await userEvent.type(input, 'N');
    
    expect(onChange).toHaveBeenCalled();
  });

  it('应支持初始数据', () => {
    render(
      <ConfigForm 
        schema={basicSchema} 
        onChange={() => {}} 
        initialData={{ title: 'Initial Title' }}
      />
    );
    
    const input = screen.getByLabelText('标题') as HTMLInputElement;
    expect(input.value).toBe('Initial Title');
  });

  it('应支持只读模式', () => {
    render(
      <ConfigForm 
        schema={basicSchema} 
        onChange={() => {}} 
        readonly={true}
      />
    );
    
    const input = screen.getByLabelText('标题') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('应支持自定义 className', () => {
    const { container } = render(
      <ConfigForm 
        schema={basicSchema} 
        onChange={() => {}} 
        className="custom-form"
      />
    );
    
    expect(container.querySelector('.custom-form')).toBeInTheDocument();
  });

  it('应支持 enum 类型生成下拉选择框', () => {
    const enumSchema = JSON.stringify({
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          title: '主题',
          enum: ['light', 'dark'],
          enumNames: ['浅色', '深色'],
        },
      },
    });
    
    render(<ConfigForm schema={enumSchema} onChange={() => {}} />);
    
    const select = screen.getByLabelText('主题');
    expect(select.tagName.toLowerCase()).toBe('select');
  });

  it('应支持 boolean 类型生成开关', () => {
    const boolSchema = JSON.stringify({
      type: 'object',
      properties: {
        enabled: { type: 'boolean', title: '启用' },
      },
    });
    
    render(<ConfigForm schema={boolSchema} onChange={() => {}} />);
    
    const checkbox = screen.getByLabelText('启用');
    expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  it('应处理无效的 JSON Schema', () => {
    render(<ConfigForm schema="invalid json" onChange={() => {}} />);
    
    expect(screen.getByTestId('rjsf-form-mock')).toBeInTheDocument();
  });
});
