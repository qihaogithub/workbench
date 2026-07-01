import fs from "node:fs";
import path from "node:path";

import { compilePreviewPageSource } from "@opencode-workbench/preview-contract/compiler";
import {
  PreviewRuntimeContractError,
  type RuntimeContractIssue,
} from "@opencode-workbench/preview-contract/runtime";

export interface PreviewValidationIssue extends RuntimeContractIssue {
  pageId: string;
  file: string;
}

export interface PreviewValidationResult {
  ok: boolean;
  pageIds: string[];
  issues: PreviewValidationIssue[];
}

function toIssue(
  pageId: string,
  file: string,
  issue: RuntimeContractIssue,
): PreviewValidationIssue {
  return { ...issue, pageId, file };
}

function validatePageSource(
  pageId: string,
  file: string,
  code: string,
): PreviewValidationIssue[] {
  try {
    compilePreviewPageSource(code, {
      resolveDependencyUrl: (specifier) => `/runtime/${specifier}.js`,
    });
    return [];
  } catch (error) {
    if (error instanceof PreviewRuntimeContractError) {
      return error.issues.map((issue) => toIssue(pageId, file, issue));
    }
    return [
      {
        pageId,
        file,
        stage: "compile_transform",
        code: "COMPILE_TRANSFORM_FAILED",
        severity: "error",
        message: error instanceof Error ? error.message : "页面源码编译失败",
        instruction: "请修复 TSX/JSX 语法错误，保留一个完整的 React 组件模块后重新生成。",
      },
    ];
  }
}

export function validateWorkspacePreviewRuntime(
  workspacePath: string,
  pageId?: string,
): PreviewValidationResult {
  const demosPath = path.join(workspacePath, "demos");
  const pageIds = pageId
    ? [pageId]
    : fs.existsSync(demosPath)
      ? fs
          .readdirSync(demosPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      : [];
  const issues: PreviewValidationIssue[] = [];

  for (const currentPageId of pageIds) {
    const relativeFile = `demos/${currentPageId}/index.tsx`;
    const file = path.join(workspacePath, relativeFile);
    if (!fs.existsSync(file)) {
      issues.push({
        pageId: currentPageId,
        file: relativeFile,
        stage: "source_contract",
        code: "FILE_READ_ERROR",
        severity: "error",
        message: `页面文件不存在: ${relativeFile}`,
        instruction: "请确认页面目录存在 index.tsx。",
      });
      continue;
    }
    issues.push(
      ...validatePageSource(
        currentPageId,
        relativeFile,
        fs.readFileSync(file, "utf-8"),
      ),
    );
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    pageIds,
    issues,
  };
}
