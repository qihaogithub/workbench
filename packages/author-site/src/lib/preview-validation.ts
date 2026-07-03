import {
  ProjectAdminService,
  type RuntimeValidationIssue,
  type RuntimeValidationResult,
} from "@opencode-workbench/project-core";

export interface PreviewValidationIssue extends RuntimeValidationIssue {
  file: string;
}

export interface PreviewValidationResult extends Omit<RuntimeValidationResult, "issues"> {
  issues: PreviewValidationIssue[];
}

function issueFile(issue: RuntimeValidationIssue): string {
  return issue.stage === "prototype_contract"
    ? `demos/${issue.pageId}/prototype.html`
    : `demos/${issue.pageId}/index.tsx`;
}

export function validateWorkspacePreviewRuntime(
  workspacePath: string,
  pageId?: string,
): PreviewValidationResult {
  const result = new ProjectAdminService().validateWorkspacePathRuntime(workspacePath, pageId);
  const runtimeValidation = result.data ?? {
    ok: false,
    issues: [],
    pageIds: pageId ? [pageId] : [],
  };

  return {
    ...runtimeValidation,
    issues: runtimeValidation.issues.map((issue) => ({
      ...issue,
      file: issueFile(issue),
    })),
  };
}
