/** 设计规范模块类型定义 */

/** 配置项引用：设计规范只存引用，不存值 */
export interface DesignSpecRef {
  scope: "project" | "page";
  pageId?: string;
  fieldKey: string;
}

/** 单个规范条目（卡片） */
export interface DesignSpecEntry {
  id: string;
  title: string;
  markdown: string;
  refs: DesignSpecRef[];
  /** 系统自动维护条目的来源字段；缺省表示手工条目 */
  autoManagedFieldKey?: string;
}

/** 一份设计规范文档 */
export interface DesignSpecDoc {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  entries: DesignSpecEntry[];
  /** 系统自动维护文档所属页面；缺省表示手工文档 */
  autoManagedPageId?: string;
}

/** 设计规范文档目录索引元信息 */
export interface DesignSpecMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 配置项素材池条目 */
export type ConfigPoolItemKind =
  | "color"
  | "text"
  | "image"
  | "number"
  | "motion";

export interface ConfigPoolItem {
  /** 稳定 ID：`${scope}:${pageId?}:${fieldKey}`，用于绑定去重 */
  id: string;
  scope: "project" | "page";
  pageId?: string;
  pageName?: string;
  key: string;
  title: string;
  kind: ConfigPoolItemKind;
  value?: unknown;
  category?: string;
  format?: string;
  /** 图片尺寸信息（schema 无法可靠推导时省略） */
  size?: {
    w: string;
    h: string;
    wMin?: boolean;
    wAny?: boolean;
    hMin?: boolean;
    hAny?: boolean;
  } | null;
  /** 项目级配置项受影响的页面标题，用于素材池拆分展示 */
  pages?: string[];
}
