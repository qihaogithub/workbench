import { config } from "../config";

export interface CompileResult {
  compiledCode: string;
  cssImports: string[];
  dependencies?: Record<string, string>;
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
    throw new Error(`Compile request failed (${response.status}): ${text}`);
  }

  const result = await response.json();

  if (!result.success || !result.data?.compiledCode) {
    const message = result.error?.message || result.error || "编译失败";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return {
    compiledCode: result.data.compiledCode,
    cssImports: result.data.cssImports || [],
    dependencies: result.data.dependencies,
  };
}
