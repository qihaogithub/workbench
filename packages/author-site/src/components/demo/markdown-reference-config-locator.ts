import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";
import { readConfigDefinitionFieldAtPath } from "@workbench/shared/demo/config-schema-definition";

/** Catalog identity is authoritative; never coerce an instance path or branch to a parent. */
export function resolveReferenceConfigDefinition(
  schema: string,
  pageId: string,
  fieldPath: string,
) {
  const field = enumerateSchemaFields(schema).find(
    (entry) => entry.key === fieldPath,
  );
  if (!field) throw new Error("配置定义不存在，请刷新目录重试");
  const draft = field.isBranch
    ? undefined
    : readConfigDefinitionFieldAtPath(schema, fieldPath);
  return { pageId, fieldPath, field, draft };
}
