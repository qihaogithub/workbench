/** 设计规范模块类型定义 */

/** 配置项引用：设计规范只存引用，不存值 */
export interface DesignSpecRef {
  scope: "project" | "page";
  pageId?: string;
  /** Schema field key or canonical nested path without runtime array indexes. */
  fieldKey: string;
}

/** 规范块的消费位置。页面规范与配置项规范互斥，避免同一内容重复出现。 */
export type DesignSpecTarget =
  | {
      type: "page";
      /** 可复用到多个页面；空数组仅用于尚未完成迁移的历史条目。 */
      pageIds: string[];
    }
  | {
      type: "config";
      /** 一条配置项规范可同时复用到多个配置项。 */
      refs: DesignSpecRef[];
    };

/** 单个规范条目（卡片） */
export interface DesignSpecEntry {
  id: string;
  title: string;
  markdown: string;
  target: DesignSpecTarget;
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
  /** Field hierarchy from the schema root to this field. */
  breadcrumbs?: string[];
  /** Discriminator/const fields are inspectable but have no definition editor. */
  isConst?: boolean;
  kind: ConfigPoolItemKind;
  value?: unknown;
  category?: string;
  format?: string;
  /** 图片尺寸信息（schema 无法可靠推导时省略） */
  size?: {
    w: string;
    h: string;
    wOperator?: string;
    hOperator?: string;
    wMin?: boolean;
    wAny?: boolean;
    hMin?: boolean;
    hAny?: boolean;
  } | null;
  /** 项目级配置项受影响的页面 IDs，用于页面筛选。 */
  pageIds?: string[];
}
