import { config } from "../config";

export interface CompileResult {
  compiledCode: string;
  cssImports: string[];
  dependencies?: string[];
  moduleHash?: string;
  moduleUrl?: string;
}

export interface CompileServiceErrorDetails {
  issues?: Array<{
    stage?: string;
    code?: string;
    moduleName?: string;
    importName?: string;
    message?: string;
    instruction?: string;
  }>;
}

export class CompileServiceError extends Error {
  readonly status?: number;
  readonly details?: CompileServiceErrorDetails;

  constructor(message: string, status?: number, details?: CompileServiceErrorDetails) {
    super(message);
    this.name = "CompileServiceError";
    this.status = status;
    this.details = details;
  }
}

export async function compileCode(
  code: string,
  sessionId?: string,
): Promise<CompileResult> {
  const body: Record<string, unknown> = { code };
  if (sessionId) {
    body.sessionId = sessionId;
  }

  const url = `${config.authorSiteUrl}/api/compile`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new CompileServiceError(
      `Compile request failed (${response.status}): ${text}`,
      response.status,
    );
  }

  const result = await response.json();

  if (!result.success || !result.data?.compiledCode) {
    const message = result.error?.message || result.error || "编译失败";
    throw new CompileServiceError(
      typeof message === "string" ? message : JSON.stringify(message),
      response.status,
      result.error?.details,
    );
  }

  return {
    compiledCode: result.data.compiledCode,
    cssImports: result.data.cssImports || [],
    dependencies: result.data.dependencies,
    moduleHash: result.data.moduleHash,
    moduleUrl: result.data.moduleUrl,
  };
}
