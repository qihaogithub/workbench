/**
 * 页面配置要求（Page Requirements）的引用解析工具。
 *
 * 页面配置要求文档以 Markdown 存储，文档内通过行内软引用 `@[名称](config_key)`
 * 指向配置项。config_key 即 config.schema.json 的属性 key，名称为该属性 title 快照。
 * 渲染时从当前页 config.schema.json 实时解析；配置项被删除/改名时引用标记为「失效」，
 * 但不会阻塞文档展示。配置项增删改不破坏文档。
 */

export interface PageRequirementRef {
  /** 配置项在 config.schema.json 中的属性 key（唯一标识）。 */
  key: string;
  /** 写入时保存的 display_name 快照（schema title）。 */
  name: string;
}

export interface ResolvedPageRequirementRef extends PageRequirementRef {
  /** 当前 schema 中该 key 是否仍存在。 */
  resolved: boolean;
  /** 若存在，当前 schema 中的 title（可能已改名）。 */
  currentName?: string;
}

const REF_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * 从 Markdown 正文中提取所有行内软引用。
 * 允许重复引用，顺序即为正文出现顺序。
 */
export function parsePageRequirementsRefs(markdown: string): PageRequirementRef[] {
  if (!markdown) return [];
  const refs: PageRequirementRef[] = [];
  let match: RegExpExecArray | null;
  REF_REGEX.lastIndex = 0;
  while ((match = REF_REGEX.exec(markdown)) !== null) {
    refs.push({ name: match[1].trim(), key: match[2].trim() });
  }
  return refs;
}

/**
 * 解析引用在正文中的偏移位置（用于反向视图定位「所在正文片段」）。
 */
export function findPageRequirementRefMatches(
  markdown: string,
  targetKey: string,
): { name: string; offset: number }[] {
  if (!markdown) return [];
  const matches: { name: string; offset: number }[] = [];
  let match: RegExpExecArray | null;
  REF_REGEX.lastIndex = 0;
  while ((match = REF_REGEX.exec(markdown)) !== null) {
    if (match[2].trim() === targetKey) {
      matches.push({ name: match[1].trim(), offset: match.index });
    }
  }
  return matches;
}

/**
 * 根据当前页 config.schema.json 的 properties 解析引用是否仍有效。
 * schemaJson 可为 undefined（无 schema 时所有引用视为失效）。
 */
export function resolvePageRequirementRefs(
  markdown: string,
  schemaJson?: string,
): ResolvedPageRequirementRef[] {
  const refs = parsePageRequirementsRefs(markdown);
  let properties: Record<string, unknown> | undefined;
  if (schemaJson) {
    try {
      const parsed = JSON.parse(schemaJson) as {
        properties?: Record<string, unknown>;
      };
      properties = parsed.properties;
    } catch {
      properties = undefined;
    }
  }
  return refs.map((ref) => {
    const prop =
      properties && properties[ref.key] as Record<string, unknown> | undefined;
    const currentTitle =
      typeof prop?.title === "string" ? prop.title : undefined;
    return {
      key: ref.key,
      name: ref.name,
      resolved: Boolean(prop),
      ...(currentTitle !== undefined ? { currentName: currentTitle } : {}),
    };
  });
}

/**
 * 从 Markdown 文档中推断标题：取首个 `# ` 一级标题，否则返回 undefined。
 */
export function inferPageRequirementTitle(markdown: string): string | undefined {
  if (!markdown) return undefined;
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : undefined;
}