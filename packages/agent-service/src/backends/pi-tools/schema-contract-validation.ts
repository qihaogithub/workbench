/**
 * Semantic config schema guardrails used by agent write tools.
 * Keep this deliberately independent of the UI schema flattener: these are
 * authoring contracts, not presentation hints.
 */

export interface SchemaContractIssue {
  code: string;
  path: string;
  message: string;
  instruction: string;
}

/** Formats already supported by the shared config runtime. Any new semantic
 * format must be registered here before an agent can write it. */
export const CONFIG_FIELD_CAPABILITIES = {
  file: { atomic: false },
  image: { atomic: false },
  video: { atomic: true },
  color: { atomic: false },
  richtext: { atomic: false },
  spine: { atomic: true },
} as const;

const REGISTERED_FORMATS = new Set(Object.keys(CONFIG_FIELD_CAPABILITIES));
const SPINE_REF_ID = /^spine_[a-f0-9]{64}$/u;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function pushIssue(
  issues: SchemaContractIssue[],
  code: string,
  path: string,
  message: string,
  instruction: string,
): void {
  issues.push({ code, path, message, instruction });
}

export function validateConfigSchemaContract(schema: unknown): SchemaContractIssue[] {
  const issues: SchemaContractIssue[] = [];
  const root = asRecord(schema);
  if (!root) return issues;

  const walk = (node: unknown, path: string): void => {
    const record = asRecord(node);
    if (!record) return;

    const format = record.format;
    if (typeof format === "string") {
      if (!REGISTERED_FORMATS.has(format)) {
        pushIssue(
          issues,
          "UNKNOWN_CONFIG_FORMAT",
          path,
          `字段 ${path} 使用了未注册的语义 format: ${format}`,
          `请使用已注册的 format（${Array.from(REGISTERED_FORMATS).join(", ")}），或先注册新的配置能力。`,
        );
      }

      const options = asRecord(record["ui:options"]);
      const accept = options?.accept ?? record.accept;
      const acceptText = typeof accept === "string" ? accept.toLowerCase() : "";
      if (format === "file" && acceptText.includes(".zip")) {
        pushIssue(
          issues,
          "SPINE_ZIP_PSEUDO_CONTRACT",
          path,
          `字段 ${path} 使用 type:string + format:file 接收 ZIP，无法表达 Spine 复合资产。`,
          '请改为 type:"object"、format:"spine" 的原子素材字段；Spine ZIP 只能通过该语义字段上传。',
        );
      }

      if (format === "spine") validateSpineField(record, path, issues);
    }

    const properties = asRecord(record.properties);
    if (properties) {
      const names = Object.keys(properties);
      if (names.includes("skeleton") && names.includes("atlas") && names.includes("texture")) {
        pushIssue(
          issues,
          "SPINE_SPLIT_UPLOAD_FIELDS",
          path,
          `字段 ${path} 暴露了 skeleton、atlas、texture 三个独立上传字段。`,
          '请将它们合并为一个 format:"spine" 的 ZIP 素材字段；三个文件仅是服务端内部解析结果。',
        );
      }
      for (const [name, child] of Object.entries(properties)) walk(child, `${path}.${name}`);
    }
    const items = record.items;
    if (items) walk(items, `${path}[]`);
  };

  const properties = asRecord(root.properties);
  if (properties) {
    for (const [name, field] of Object.entries(properties)) walk(field, name);
  }
  return issues;
}

function validateSpineField(
  field: Record<string, unknown>,
  path: string,
  issues: SchemaContractIssue[],
): void {
  if (field.type !== "object") {
    pushIssue(issues, "SPINE_FIELD_NOT_OBJECT", path, `Spine 字段 ${path} 必须是 object。`, '请将 Spine 字段声明为 type:"object"、format:"spine"。');
    return;
  }
  const properties = asRecord(field.properties);
  const required = Array.isArray(field.required) ? field.required : [];
  const expected = ["kind", "version", "assetId"];
  if (!properties || expected.some((name) => !properties[name]) || expected.some((name) => !required.includes(name))) {
    pushIssue(issues, "SPINE_REF_SHAPE_INVALID", path, `Spine 字段 ${path} 必须声明 kind、version、assetId。`, '请使用 SpineAssetRefV1：kind="spine"、version=1、assetId 为 spine_ 加 64 位十六进制哈希。');
    return;
  }
  const kind = asRecord(properties.kind);
  const version = asRecord(properties.version);
  const assetId = asRecord(properties.assetId);
  if (kind?.const !== "spine" || version?.const !== 1 || assetId?.pattern !== SPINE_REF_ID.source) {
    pushIssue(issues, "SPINE_REF_CONSTRAINT_INVALID", path, `Spine 字段 ${path} 的引用约束不符合 SpineAssetRefV1。`, 'kind 必须 const="spine"，version 必须 const=1，assetId pattern 必须为 ^spine_[a-f0-9]{64}$。');
  }
}
