export const PREVIEW_CONTRACT_VERSION = "2026-07-preview-contract-v1";

export type PreviewDependencyKind = "core" | "internal" | "sdk";

export interface PreviewDependencyDefinition {
  version: string;
  kind: PreviewDependencyKind;
}

export const PREVIEW_DEPENDENCY_POLICY: Record<string, PreviewDependencyDefinition> = {
  react: { version: "18.3.1", kind: "core" },
  "react-dom": { version: "18.3.1", kind: "core" },
  "lucide-react": { version: "0.323.0", kind: "internal" },
  "framer-motion": { version: "12.38.0", kind: "internal" },
  "svgaplayerweb": { version: "2.3.1", kind: "internal" },
  "@preview/sdk": { version: PREVIEW_CONTRACT_VERSION, kind: "sdk" },
};

export function generatePreviewAuthoringRules(): string {
  const allowedPackages = Object.keys(PREVIEW_DEPENDENCY_POLICY).sort().join(", ");
  return [
    "## 创作端页面运行契约",
    "",
    `当前契约版本：${PREVIEW_CONTRACT_VERSION}`,
    "",
    "- 页面源码必须是单文件 React 组件，提交源码时保留原始 JSX。",
    "- 页面源码必须提供 export default 组件；裸 JSX 或首字母大写组件可由编译器自动包装。",
    "- 页面源码禁止直接导入 react/jsx-runtime；该导入只允许出现在编译产物中。",
    "- 页面源码禁止相对源码 import；共享能力使用 @preview/sdk，图片使用配置数据或 ImageAsset，SVGA 使用 SvgaPlayer。",
    `- 页面源码只能导入已登记依赖：${allowedPackages}。`,
    "- lucide-react 只能导入当前版本实际存在的图标。",
    "- 组件不得 return null；等待、空状态或异常状态必须返回可见 DOM。",
    "- 页面 schema 只在用户明确要求可配置字段时新增，不能从静态内容自行推断配置项。",
  ].join("\n");
}
