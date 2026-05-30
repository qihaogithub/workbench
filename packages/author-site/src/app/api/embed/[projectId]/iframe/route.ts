import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  projectExists,
  getProjectPath,
  readProjectMeta,
  getDemoDirPath,
  getProjectConfigSchema,
  listDemoPages,
} from "@/lib/fs-utils";
import { compileCode } from "@/lib/compiler";
import { generateIframeHtml } from '@opencode-workbench/shared/demo/iframe-template';
import { getCdnBaseUrl } from '@/lib/cdn-config';
import {
  mergeConfigToProps,
  SchemaConflictError,
} from "@/lib/runtime-props";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { projectId } = params;

    const url = new URL(request.url);
    const page = url.searchParams.get("page");

    if (!projectExists(projectId)) {
      return new NextResponse("Project not found", { status: 404 });
    }

    const workspacePath = path.join(getProjectPath(projectId), "workspace");

    let effectivePage = page;
    if (!effectivePage) {
      const demoPages = listDemoPages(workspacePath);
      if (demoPages.length > 0) {
        effectivePage = demoPages[0].id;
      }
    }

    if (!effectivePage) {
      const singleCodePath = path.join(workspacePath, "index.tsx");
      if (!fs.existsSync(singleCodePath)) {
        return new NextResponse("No demo pages found", { status: 404 });
      }

      const code = fs.readFileSync(singleCodePath, "utf-8");
      const project = readProjectMeta(projectId);
      const lockedDependencies = project?.lockedDependencies;
      const compileResult = compileCode(code, lockedDependencies);

      const projectSchemaStr = getProjectConfigSchema(workspacePath);
      let configData: Record<string, unknown> = {};
      try {
        const schema = JSON.parse(projectSchemaStr || "{}");
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            const p = prop as Record<string, unknown>;
            if (p.default !== undefined) {
              configData[key] = p.default;
            }
          }
        }
      } catch {}

      const html = generateIframeHtml({
        compiledCode: compileResult.compiledCode,
        cssImports: compileResult.cssImports,
        configData,
        cdnBaseUrl: getCdnBaseUrl(),
      });

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const demoDir = getDemoDirPath(workspacePath, effectivePage);
    const codePath = path.join(demoDir, "index.tsx");
    const pageSchemaPath = path.join(demoDir, "config.schema.json");

    if (!fs.existsSync(codePath)) {
      return new NextResponse("Demo page not found", { status: 404 });
    }

    const code = fs.readFileSync(codePath, "utf-8");

    const project = readProjectMeta(projectId);
    const lockedDependencies = project?.lockedDependencies;

    const compileResult = compileCode(code, lockedDependencies);

    const projectSchemaStr = getProjectConfigSchema(workspacePath);
    const pageSchemaStr = fs.existsSync(pageSchemaPath)
      ? fs.readFileSync(pageSchemaPath, "utf-8")
      : "{}";

    let mergedProps: Record<string, unknown>;
    try {
      mergedProps = mergeConfigToProps(projectSchemaStr, pageSchemaStr);
    } catch (error) {
      if (error instanceof SchemaConflictError) {
        return new NextResponse(
          `Schema 字段冲突: ${error.conflicts.join(", ")}`,
          { status: 400 },
        );
      }
      throw error;
    }

    const html = generateIframeHtml({
      compiledCode: compileResult.compiledCode,
      cssImports: compileResult.cssImports,
      configData: mergedProps,
      cdnBaseUrl: getCdnBaseUrl(),
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Embed iframe error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new NextResponse(message, { status: 500 });
  }
}
