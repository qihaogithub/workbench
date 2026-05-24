import type { ValidationError } from "./validator";

export interface UserFriendlyError {
  summary: string;
  details: string;
  count: number;
  canAutoFix: boolean;
}

function getCategoryPart(errors: ValidationError[], typeFilter: ValidationError["type"] | ValidationError["type"][], label: string): string | null {
  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
  const count = errors.filter((e) => types.includes(e.type)).length;
  if (count === 0) return null;
  return `${count} ${label}`;
}

export function mapToUserFriendly(errors: ValidationError[]): UserFriendlyError {
  if (errors.length === 0) {
    return { summary: "", details: "", count: 0, canAutoFix: true };
  }

  const parts: string[] = [];
  const jsonCount = getCategoryPart(errors, "json_syntax", "处配置文件格式有误");
  const interfaceCount = getCategoryPart(errors, "interface_not_found", "处代码缺少配置项定义");
  const propsCount = getCategoryPart(
    errors,
    ["props_code_not_in_schema", "props_schema_not_in_code"],
    "个配置项未正确注册",
  );
  const requiredCount = getCategoryPart(errors, "required_missing", "个必填项缺少定义");

  if (jsonCount) parts.push(jsonCount);
  if (interfaceCount) parts.push(interfaceCount);
  if (propsCount) parts.push(propsCount);
  if (requiredCount) parts.push(requiredCount);

  const summary = parts.length > 0
    ? `当前代码有 ${parts.join("，")}，AI 可以帮你一键修复`
    : `当前代码有 ${errors.length} 处需要调整，AI 可以帮你一键修复`;

  const details = errors
    .map((e) => {
      const severity = e.severity === "error" ? "错误" : e.severity === "warning" ? "警告" : "提示";
      const location = e.location
        ? ` (${e.location.type === "code" ? "代码" : "Schema"}${e.location.line ? ` 第${e.location.line}行` : ""})`
        : "";
      const fix = e.fixSuggestion ? `\n  建议: ${e.fixSuggestion.description}` : "";
      return `- [${severity}] ${e.message}${location}${fix}`;
    })
    .join("\n");

  return { summary, details, count: errors.length, canAutoFix: true };
}
