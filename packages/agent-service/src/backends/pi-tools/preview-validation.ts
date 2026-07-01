import { PreviewRuntimeContractError, type RuntimeContractIssue } from '@opencode-workbench/preview-contract/runtime';
import { compilePreviewPageSource } from '@opencode-workbench/preview-contract/compiler';

interface ToolRuntimeValidationIssue extends RuntimeContractIssue {
  file: string;
}

export interface ToolRuntimeValidation {
  ok: boolean;
  file: string;
  pageId?: string;
  issues: ToolRuntimeValidationIssue[];
}

function getPageIdFromPath(filePath: string): string | undefined {
  const match = filePath.match(/^demos\/([^/]+)\/index\.tsx$/u);
  return match?.[1];
}

function normalizePath(filePath: string): string {
  return filePath.split('\\').join('/');
}

function toToolIssue(file: string, issue: RuntimeContractIssue): ToolRuntimeValidationIssue {
  return { ...issue, file };
}

export function validatePreviewFileWrite(
  filePath: string,
  content: string,
): ToolRuntimeValidation | undefined {
  const normalizedPath = normalizePath(filePath);
  const pageId = getPageIdFromPath(normalizedPath);

  if (pageId) {
    try {
      compilePreviewPageSource(content, {
        resolveDependencyUrl: (specifier) => `/runtime/${specifier}.js`,
      });
      return { ok: true, file: normalizedPath, pageId, issues: [] };
    } catch (error) {
      if (error instanceof PreviewRuntimeContractError) {
        return {
          ok: false,
          file: normalizedPath,
          pageId,
          issues: error.issues.map((issue) => toToolIssue(normalizedPath, issue)),
        };
      }
      return {
        ok: false,
        file: normalizedPath,
        pageId,
        issues: [
          {
            file: normalizedPath,
            stage: 'compile_transform',
            code: 'COMPILE_TRANSFORM_FAILED',
            severity: 'error',
            message: error instanceof Error ? error.message : '页面源码编译失败',
            instruction: '请修复 TSX/JSX 语法错误，保留一个完整的 React 组件模块后重新生成。',
          },
        ],
      };
    }
  }

  if (/^demos\/[^/]+\/config\.schema\.json$/u.test(normalizedPath)) {
    try {
      JSON.parse(content);
      return { ok: true, file: normalizedPath, issues: [] };
    } catch {
      return {
        ok: false,
        file: normalizedPath,
        issues: [
          {
            file: normalizedPath,
            stage: 'schema_contract',
            code: 'INVALID_JSON',
            severity: 'error',
            message: '页面配置 schema 不是合法 JSON',
            instruction: '请修复 config.schema.json 的 JSON 语法；如果页面不需要配置字段，保留空 properties 对象。',
          },
        ],
      };
    }
  }

  return undefined;
}
