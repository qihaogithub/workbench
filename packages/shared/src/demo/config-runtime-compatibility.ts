export interface ConfigRuntimeCompatibilityResult {
  supported: boolean;
  unsupportedFields: Array<{
    path: string;
    type: string;
    reason: string;
  }>;
}

const UNSUPPORTED_TYPES = new Set([
  'array', 'imageList', 'richtext', 'cascade',
]);

const ROOT_UPGRADE_DEMO_KEYS = new Set([
  'orderable', 'orderableHorizontal', 'positionable',
]);

function isUnsupportedType(type: unknown): type is string {
  return typeof type === 'string' && UNSUPPORTED_TYPES.has(type);
}

function isUnsupportedUiWidget(uiWidget: unknown): uiWidget is string {
  return typeof uiWidget === 'string' && (
    uiWidget === 'imageList' || uiWidget === 'cascade'
  );
}

function isPositionType(type: unknown): boolean {
  return typeof type === 'string' && type === 'position';
}

function isEnumMultiple(prop: Record<string, unknown>): boolean {
  return prop.type === 'enum' && prop.multiple === true;
}

function hasPositionableAnnotation(prop: Record<string, unknown>): boolean {
  const demo = prop.$demo;
  return (
    demo != null &&
    typeof demo === 'object' &&
    !Array.isArray(demo) &&
    'positionable' in (demo as Record<string, unknown>)
  );
}

function traverseProperties(
  basePath: string,
  properties: Record<string, unknown>,
  unsupportedFields: Array<{ path: string; type: string; reason: string }>,
): void {
  for (const [key, value] of Object.entries(properties)) {
    if (value == null || typeof value !== 'object') continue;
    const prop = value as Record<string, unknown>;
    const currentPath = basePath ? `${basePath}.${key}` : key;

    const type = prop.type;

    if (isUnsupportedType(type)) {
      let reason = `原型页不支持 \`${type}\` 类型（需结构化消费）`;
      if (type === 'array') {
        const demo = prop.$demo;
        if (demo != null && typeof demo === 'object' && !Array.isArray(demo)) {
          const extras: string[] = [];
          if ((demo as Record<string, unknown>).sortable) extras.push('sortable');
          if ((demo as Record<string, unknown>).maxItems != null) extras.push('maxItems');
          if (extras.length > 0) reason += `（\`$demo.${extras.join(', ')}\`）`;
        }
      }
      unsupportedFields.push({ path: currentPath, type: String(type), reason });
      continue;
    }

    if (isUnsupportedUiWidget(prop['ui:widget'])) {
      unsupportedFields.push({
        path: currentPath,
        type: String(prop['ui:widget']),
        reason: `原型页不支持 \`ui:widget: "${prop['ui:widget']}"\`（需结构化消费）`,
      });
      continue;
    }

    if (isPositionType(type)) {
      unsupportedFields.push({
        path: currentPath,
        type: 'position',
        reason: '原型页不支持 `type: "position"`（需坐标定位渲染）',
      });
      continue;
    }

    if (isEnumMultiple(prop)) {
      unsupportedFields.push({
        path: currentPath,
        type: 'enum',
        reason: '原型页不支持 `enum` 多选（`multiple: true`）',
      });
      continue;
    }

    if (type === 'object' && hasPositionableAnnotation(prop)) {
      unsupportedFields.push({
        path: currentPath,
        type: 'object',
        reason: '原型页不支持 `$demo.positionable` 位置容器（需坐标定位渲染）',
      });
      continue;
    }

    if (type === 'object' && prop.properties != null && typeof prop.properties === 'object') {
      traverseProperties(currentPath, prop.properties as Record<string, unknown>, unsupportedFields);
    }

    if (prop.oneOf != null && Array.isArray(prop.oneOf)) {
      for (const variant of prop.oneOf) {
        if (variant != null && typeof variant === 'object' && !Array.isArray(variant)) {
          const variantProps = (variant as Record<string, unknown>).properties;
          if (variantProps != null && typeof variantProps === 'object' && !Array.isArray(variantProps)) {
            traverseProperties(`${currentPath}.variants`, variantProps as Record<string, unknown>, unsupportedFields);
          }
        }
      }
    }
  }
}

export function checkConfigSchemaAgainstPrototype(
  schema: string | Record<string, unknown>,
): ConfigRuntimeCompatibilityResult {
  const unsupportedFields: Array<{ path: string; type: string; reason: string }> = [];

  let parsed: Record<string, unknown>;
  if (typeof schema === 'string') {
    try {
      parsed = JSON.parse(schema) as Record<string, unknown>;
    } catch {
      return { supported: true, unsupportedFields: [] };
    }
  } else {
    parsed = schema;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { supported: true, unsupportedFields: [] };
  }

  const demo = parsed.$demo;
  if (demo != null && typeof demo === 'object' && !Array.isArray(demo)) {
    for (const key of ROOT_UPGRADE_DEMO_KEYS) {
      if (key in (demo as Record<string, unknown>)) {
        unsupportedFields.push({
          path: `$demo.${key}`,
          type: 'extended',
          reason: `原型页不支持 \`$demo.${key}\`（需结构化排序/定位能力）`,
        });
      }
    }
  }

  const properties = parsed.properties;
  if (properties != null && typeof properties === 'object' && !Array.isArray(properties)) {
    traverseProperties('', properties as Record<string, unknown>, unsupportedFields);
  }

  return {
    supported: unsupportedFields.length === 0,
    unsupportedFields,
  };
}