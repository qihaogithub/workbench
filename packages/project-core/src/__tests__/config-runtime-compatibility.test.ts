import { describe, expect, it } from 'vitest';
import { checkConfigSchemaAgainstPrototype } from '@workbench/shared/demo/config-runtime-compatibility';

describe('checkConfigSchemaAgainstPrototype', () => {
  it('标量类型保持原型页：string', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        title: { type: 'string', title: '标题' },
      },
    });
    expect(result.supported).toBe(true);
    expect(result.unsupportedFields).toEqual([]);
  });

  it('标量类型保持原型页：number/integer/boolean/text/color/image/enum', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        count: { type: 'number', title: '数量' },
        age: { type: 'integer', title: '年龄' },
        enabled: { type: 'boolean', title: '启用' },
        desc: { type: 'text', title: '描述' },
        bgColor: { type: 'color', title: '背景色' },
        avatar: { type: 'image', title: '头像' },
        mode: { type: 'enum', title: '模式', options: [{ value: 'a', label: 'A' }] },
      },
    });
    expect(result.supported).toBe(true);
  });

  it('array 类型触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        modules: { type: 'array', title: '模块列表', items: { type: 'object', properties: {} } },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: 'modules', type: 'array' });
  });

  it('imageList 类型触发升级（type 写法）', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        images: { type: 'imageList', title: '图片列表' },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: 'images', type: 'imageList' });
  });

  it('imageList 类型触发升级（ui:widget 写法）', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        images: { type: 'string', 'ui:widget': 'imageList', title: '图片列表' },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: 'images', type: 'imageList' });
  });

  it('richtext 类型触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        content: { type: 'richtext', title: '内容' },
      },
    });
    expect(result.supported).toBe(false);
  });

  it('cascade 类型触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        region: { type: 'cascade', title: '地区', options: [] },
      },
    });
    expect(result.supported).toBe(false);
  });

  it('enum 多选触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        tags: { type: 'enum', title: '标签', multiple: true, options: [{ value: 'a', label: 'A' }] },
      },
    });
    expect(result.supported).toBe(false);
  });

  it('type:position 触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        logo: { type: 'position', title: 'Logo 位置', key: 'logo', size: { width: 100, height: 50 } },
      },
    });
    expect(result.supported).toBe(false);
  });

  it('$demo.orderable 触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      $demo: { orderable: ['header', 'footer'] },
      properties: {
        header: { type: 'string', title: '页头' },
        footer: { type: 'string', title: '页脚' },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: '$demo.orderable' });
  });

  it('$demo.orderableHorizontal 触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      $demo: { orderableHorizontal: ['left', 'right'] },
      properties: {
        left: { type: 'string', title: '左' },
        right: { type: 'string', title: '右' },
      },
    });
    expect(result.supported).toBe(false);
  });

  it('$demo.positionable 触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      $demo: { positionable: { items: ['logo'], size: { width: 800, height: 600 } } },
      properties: {
        logo: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: '$demo.positionable' });
  });

  it('属性级 $demo.positionable 触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        badge: {
          type: 'object',
          title: '徽章位置',
          $demo: { positionable: { key: 'badge', size: { width: 320, height: 240 } } },
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: 'badge', type: 'object' });
  });

  it('visibleWhen 不触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        mode: { type: 'enum', title: '模式', options: [{ value: 'a', label: 'A' }] },
        detail: { type: 'string', title: '详情', visibleWhen: { field: 'mode', eq: 'a' } },
      },
    });
    expect(result.supported).toBe(true);
  });

  it('$demo.previewSize / note 不触发升级', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      $demo: { previewSize: { width: 375, height: 812 }, note: '测试页面' },
      properties: {
        title: { type: 'string', title: '标题' },
      },
    });
    expect(result.supported).toBe(true);
  });

  it('object 分组容器递归检查子字段', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        style: {
          type: 'object',
          title: '样式',
          properties: {
            bgColor: { type: 'color', title: '背景色' },
            items: { type: 'array', title: '元素列表', items: { type: 'object', properties: {} } },
          },
        },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: 'style.items', type: 'array' });
  });

  it('嵌套 oneOf variant 检查', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        block: {
          type: 'object',
          title: '区块',
          oneOf: [
            {
              title: '文本',
              properties: { text: { type: 'string', title: '文字' } },
            },
            {
              title: '图片组',
              properties: { images: { type: 'imageList', title: '图片列表' } },
            },
          ],
        },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0]).toMatchObject({ path: 'block.variants.images', type: 'imageList' });
  });

  it('非法 JSON 不崩溃', () => {
    const result = checkConfigSchemaAgainstPrototype('not valid json');
    expect(result.supported).toBe(true);
    expect(result.unsupportedFields).toEqual([]);
  });

  it('空 schema 不崩溃', () => {
    const result = checkConfigSchemaAgainstPrototype({});
    expect(result.supported).toBe(true);
  });

  it('空 properties 不崩溃', () => {
    const result = checkConfigSchemaAgainstPrototype({ type: 'object', properties: {} });
    expect(result.supported).toBe(true);
  });

  it('array 的 $demo.sortable/maxItems 在 reason 中标注', () => {
    const result = checkConfigSchemaAgainstPrototype({
      type: 'object',
      properties: {
        modules: {
          type: 'array',
          title: '模块列表',
          $demo: { sortable: true, maxItems: 5 },
          items: { type: 'object', properties: {} },
        },
      },
    });
    expect(result.supported).toBe(false);
    expect(result.unsupportedFields[0].reason).toContain('sortable');
    expect(result.unsupportedFields[0].reason).toContain('maxItems');
  });
});