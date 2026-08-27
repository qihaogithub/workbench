import type { HtmlImportAnalysis } from "@workbench/project-core";

const RESTRICTED_CAPABILITY_LABELS: Record<string, string> = {
  "external-script": "外部脚本",
  "external-module-import": "外部模块",
  "embedded-browsing-context": "嵌入页面",
  "base-url": "资源基准地址",
  "meta-refresh": "自动跳转",
  "relative-resource": "相对资源",
  "remote-resource": "远程资源",
  "form-submission": "真实表单提交",
  worker: "Worker",
  "service-worker": "Service Worker",
  popup: "弹窗",
  download: "下载",
  "sensitive-permission": "敏感权限",
  "blob-script": "Blob 脚本",
  "css-external-resource": "外部 CSS 资源",
};

export function describeHtmlImportRestrictions(
  analysis: HtmlImportAnalysis,
): string | undefined {
  const labels = Array.from(
    new Set(
      (analysis.unsupportedCapabilities ?? []).map(
        (capability) =>
          RESTRICTED_CAPABILITY_LABELS[capability.code] ?? capability.code,
      ),
    ),
  );
  if (labels.length === 0) return undefined;
  const listed = labels.slice(0, 3).join("、");
  return `已隔离导入；${listed}${labels.length > 3 ? "等" : ""}不可用。`;
}
