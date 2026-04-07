'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ConfigFormProps } from './types';

interface FieldConfig {
  key: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
}

interface FieldGroup {
  title: string;
  icon?: string;
  fields: FieldConfig[];
  color?: string;
}

function parseSchemaToFields(schema: string): FieldGroup[] {
  try {
    const parsed = JSON.parse(schema);
    const properties = parsed.properties || {};
    const required = parsed.required || [];
    
    // 智能分组：根据字段名的前缀或类型分组
    const groups: Record<string, FieldConfig[]> = {};
    const ungrouped: FieldConfig[] = [];

    Object.entries(properties).forEach(([key, prop]: [string, any]) => {
      const field: FieldConfig = {
        key,
        title: prop.title || formatFieldName(key),
        type: prop.type || 'string',
        description: prop.description,
        required: required.includes(key),
        default: prop.default,
        enum: prop.enum,
        enumNames: prop.enumNames,
        minimum: prop.minimum,
        maximum: prop.maximum,
        maxLength: prop.maxLength,
        format: prop.format,
      };

      // 尝试智能分组
      const groupName = detectGroup(key, prop);
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(field);
    });

    // 转换为 FieldGroup 数组
    return Object.entries(groups).map(([title, fields], index) => ({
      title,
      fields,
      color: getGroupColor(index),
    }));
  } catch {
    return [];
  }
}

function formatFieldName(key: string): string {
  // 将 camelCase 或 snake_case 转换为易读格式
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function detectGroup(key: string, prop: any): string {
  // 根据字段名检测分组
  if (key.startsWith('color') || key.endsWith('Color') || prop.format === 'color') {
    return '颜色配置';
  }
  if (key.startsWith('size') || key.endsWith('Size') || key.endsWith('Width') || key.endsWith('Height')) {
    return '尺寸设置';
  }
  if (key.startsWith('text') || key.endsWith('Text') || key.endsWith('Title') || key.endsWith('Content')) {
    return '文本内容';
  }
  if (key.startsWith('image') || key.endsWith('Image') || key.endsWith('Url') || key.endsWith('Icon')) {
    return '图片资源';
  }
  if (key.startsWith('show') || key.startsWith('hide') || key.startsWith('enable') || key.startsWith('disable')) {
    return '显示选项';
  }
  if (key.startsWith('animation') || key.endsWith('Animation') || key.endsWith('Transition')) {
    return '动画效果';
  }
  if (key.startsWith('layout') || key.endsWith('Layout') || key.endsWith('Position')) {
    return '布局设置';
  }
  
  return '基础配置';
}

function getGroupColor(index: number): string {
  const colors = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-green-500 to-emerald-500',
    'from-orange-500 to-yellow-500',
    'from-red-500 to-rose-500',
    'from-indigo-500 to-blue-500',
  ];
  return colors[index % colors.length];
}

function FieldRenderer({ 
  field, 
  value, 
  onChange 
}: { 
  field: FieldConfig; 
  value: unknown; 
  onChange: (value: unknown) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);

  const renderInput = () => {
    // 颜色选择器
    if (field.format === 'color' || field.type === 'color') {
      return (
        <div className="flex gap-2 items-center">
          <div className="relative">
            <input
              type="color"
              value={(value as string) || '#000000'}
              onChange={(e) => onChange(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border hover:border-primary transition-colors"
            />
          </div>
          <Input
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="flex-1 font-mono"
          />
        </div>
      );
    }

    // 布尔值 - 开关
    if (field.type === 'boolean') {
      return (
        <div className="flex items-center justify-between py-2">
          <Switch
            checked={(value as boolean) || false}
            onCheckedChange={(checked: boolean) => onChange(checked)}
          />
          <Badge variant={(value as boolean) ? 'default' : 'secondary'}>
            {(value as boolean) ? '开启' : '关闭'}
          </Badge>
        </div>
      );
    }

    // 数字范围 - 滑块
    if (field.type === 'number' || field.type === 'integer') {
      if (field.minimum !== undefined && field.maximum !== undefined) {
        return (
          <div className="space-y-3">
            <Slider
              value={[(value as number) || field.minimum || 0]}
              min={field.minimum}
              max={field.maximum}
              step={field.type === 'integer' ? 1 : 0.1}
              onValueChange={(vals: number[]) => onChange(vals[0])}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{field.minimum}</span>
              <span className="font-mono font-medium text-foreground">
                {(value as number) || field.minimum}
              </span>
              <span>{field.maximum}</span>
            </div>
          </div>
        );
      }

      return (
        <Input
          type="number"
          value={(value as number)?.toString() || ''}
          onChange={(e) => onChange(field.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
          min={field.minimum}
          max={field.maximum}
          className="font-mono"
        />
      );
    }

    // 枚举值 - 下拉选择
    if (field.enum && field.enum.length > 0) {
      const currentValue = value || field.default || field.enum[0];
      const currentIndex = field.enum.indexOf(currentValue);
      const displayValue = field.enumNames?.[currentIndex] || currentValue?.toString();

      return (
        <Select
          value={currentValue?.toString()}
          onValueChange={(val: string) => {
            const index = field.enum!.indexOf(val as any);
            onChange(index >= 0 ? field.enum![index] : val);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="请选择">{displayValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.enum.map((item, idx) => {
              const itemValue = item?.toString() || '';
              return (
                <SelectItem key={idx} value={itemValue}>
                  {field.enumNames?.[idx] || itemValue}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      );
    }

    // 长文本 - 文本域
    if (field.maxLength && field.maxLength > 100) {
      return (
        <Textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.title}`}
          maxLength={field.maxLength}
          rows={4}
          className="resize-none"
        />
      );
    }

    // 默认 - 文本输入
    return (
      <Input
        type="text"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`请输入${field.title}`}
        maxLength={field.maxLength}
      />
    );
  };

  return (
    <div
      className={cn(
        'group space-y-2 p-4 rounded-xl border bg-card transition-all duration-200',
        isFocused && 'border-primary shadow-md shadow-primary/10',
        !isFocused && 'hover:border-primary/50 hover:shadow-sm'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-foreground">
            {field.title}
          </Label>
          {field.required && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              必填
            </Badge>
          )}
        </div>
        {field.description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[200px]">{field.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {renderInput()}
      </div>
    </div>
  );
}

function FieldGroupSection({ 
  group, 
  formData, 
  onChange 
}: { 
  group: FieldGroup; 
  formData: Record<string, unknown>; 
  onChange: (key: string, value: unknown) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-card to-card/50 border hover:shadow-md transition-all duration-200"
      >
        <div className={cn('w-1 h-8 rounded-full bg-gradient-to-b', group.color)} />
        <h3 className="flex-1 text-left text-sm font-semibold">{group.title}</h3>
        <Badge variant="secondary" className="text-xs">
          {group.fields.length}
        </Badge>
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
        )}
      </button>

      {!isCollapsed && (
        <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
          {group.fields.map((field) => (
            <FieldRenderer
              key={field.key}
              field={field}
              value={formData[field.key]}
              onChange={(value) => onChange(field.key, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfigForm({
  schema,
  onChange,
  initialData,
  readonly,
  className,
}: ConfigFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData || {});

  const fieldGroups = useMemo(() => parseSchemaToFields(schema), [schema]);

  const handleFieldChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onChange(newData);
  };

  if (fieldGroups.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-64 text-center', className)}>
        <div className="relative mb-4">
          <Sparkles className="h-12 w-12 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">暂无配置项</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          请检查 Schema 格式是否正确
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <ScrollArea className="h-[calc(100vh-280px)] pr-2">
        <div className="space-y-6 pb-4">
          {fieldGroups.map((group, index) => (
            <FieldGroupSection
              key={index}
              group={group}
              formData={formData}
              onChange={handleFieldChange}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
