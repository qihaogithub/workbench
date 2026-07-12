import type { PrototypePageMeta } from "@workbench/shared/contracts";

export const DEFAULT_DEMO_CODE = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
`;

export const DEFAULT_DEMO_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Demo 配置",
    type: "object",
    properties: {
      title: { type: "string", title: "标题", default: "Hello World" },
      description: {
        type: "string",
        title: "描述",
        default: "This is a demo",
      },
    },
    required: ["title"],
  },
  null,
  2,
);

export const DEFAULT_PROTOTYPE_HTML = `<main class="prototype-page">
  <section class="prototype-hero">
    <p class="eyebrow">Prototype</p>
    <h1>HTML/CSS 原型页</h1>
    <p>用于快速表达页面结构和信息层级。</p>
  </section>
</main>`;

export const DEFAULT_PROTOTYPE_CSS = `.prototype-page {
  min-height: 100%;
  padding: 32px;
  background: #f8fafc;
  color: #111827;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.prototype-hero {
  border: 1px solid #d1d5db;
  background: #ffffff;
  padding: 28px;
}
.eyebrow {
  color: #2563eb;
  font-size: 12px;
  text-transform: uppercase;
}`;

export const DEFAULT_PROTOTYPE_META: PrototypePageMeta = {
  width: 390,
  height: 844,
  generatedBy: "project-core",
};

export const DEFAULT_SKETCH_META: Record<string, unknown> = {
  generatedBy: "project-core",
  updatedAt: 0,
};

export const MAX_PROTOTYPE_HTML_LENGTH = 120_000;
export const MAX_PROTOTYPE_CSS_LENGTH = 80_000;
export const PROTOTYPE_GLOBAL_SELECTOR_RE = /(^|[,{;]\s*)(html|body|:root)\b/i;

export const WORKSPACE_TREE_FILENAME = "workspace-tree.json";
export const APP_GRAPH_FILENAME = "app.graph.json";
export const PROJECT_CONFIG_FILENAME = "project.config.schema.json";
export const PROJECT_CONFIG_VALUES_FILENAME = "project.config.values.json";
export const PROJECT_IMAGE_MANIFEST_FILENAME = "images.json";
export const EDIT_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_VERSIONS_KEEP = 50;
export const MAX_ASSET_SIZE = 10 * 1024 * 1024;
export const ALLOWED_ASSET_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export const DEFAULT_PROJECT_CATEGORY = "未分类";
export const CONTENT_GRAPH_SCHEMA_VERSION = 1;
export const MATERIALIZER_VERSION = "project-core-content-graph-v1";
