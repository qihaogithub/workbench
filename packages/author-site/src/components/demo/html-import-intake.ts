import type { DemoPageMeta, PagePresentationProfile } from "@workbench/shared";
import type { CommittedHtmlImport, PreparedHtmlImport } from "@/lib/project-api";

export interface HtmlImportIntakeClient {
  prepareHtmlImport(
    projectId: string,
    sessionId: string,
    filename: string,
    html: string,
    name?: string,
  ): Promise<PreparedHtmlImport>;
  commitHtmlImport(
    projectId: string,
    sessionId: string,
    draftId: string,
    presentation: PagePresentationProfile,
    name?: string,
    confirmationAccepted?: boolean,
  ): Promise<CommittedHtmlImport>;
  cancelHtmlImport(
    projectId: string,
    sessionId: string,
    draftId: string,
  ): Promise<void>;
}

export interface DirectFigmaHtmlImport {
  page: DemoPageMeta;
  filename: string;
  blockedResourceCount: number;
}

export interface HtmlImportIntakeResult {
  imported: DirectFigmaHtmlImport[];
  remainingFiles: File[];
  failures: Array<{ filename: string; error: Error }>;
}

function isTrustedFigmaExport(prepared: PreparedHtmlImport): boolean {
  return prepared.analysis.source.confirmationBypassEligible;
}

async function cancelQuietly(
  api: HtmlImportIntakeClient,
  projectId: string,
  sessionId: string,
  draftId: string,
) {
  try {
    await api.cancelHtmlImport(projectId, sessionId, draftId);
  } catch {
    // Draft TTL remains the recovery path if a best-effort cleanup cannot run.
  }
}

/**
 * Prepare every selected file once. Trusted Figma exports commit immediately;
 * all other files remain available for the normal import workbench.
 */
export async function importTrustedFigmaHtmlFiles(input: {
  api: HtmlImportIntakeClient;
  projectId: string;
  sessionId: string;
  files: File[];
}): Promise<HtmlImportIntakeResult> {
  const imported: DirectFigmaHtmlImport[] = [];
  const remainingFiles: File[] = [];
  const failures: HtmlImportIntakeResult["failures"] = [];

  for (const file of input.files) {
    let html: string;
    try {
      html = await file.text();
    } catch (error) {
      failures.push({
        filename: file.name,
        error: error instanceof Error ? error : new Error("读取 HTML 文件失败"),
      });
      remainingFiles.push(file);
      continue;
    }

    let prepared: PreparedHtmlImport;
    try {
      prepared = await input.api.prepareHtmlImport(
        input.projectId,
        input.sessionId,
        file.name,
        html,
      );
    } catch (error) {
      failures.push({
        filename: file.name,
        error: error instanceof Error ? error : new Error("准备 HTML 导入失败"),
      });
      remainingFiles.push(file);
      continue;
    }

    if (!isTrustedFigmaExport(prepared)) {
      await cancelQuietly(
        input.api,
        input.projectId,
        input.sessionId,
        prepared.draftId,
      );
      remainingFiles.push(file);
      continue;
    }

    try {
      const committed = await input.api.commitHtmlImport(
        input.projectId,
        input.sessionId,
        prepared.draftId,
        prepared.recommendation,
        prepared.name,
        true,
      );
      imported.push({
        page: committed.page,
        filename: file.name,
        blockedResourceCount: prepared.analysis.resourceReferences.filter(
          (resource) => resource.impact === "blocked",
        ).length,
      });
    } catch (error) {
      await cancelQuietly(
        input.api,
        input.projectId,
        input.sessionId,
        prepared.draftId,
      );
      failures.push({
        filename: file.name,
        error: error instanceof Error ? error : new Error("导入 Figma HTML 失败"),
      });
    }
  }

  return { imported, remainingFiles, failures };
}
