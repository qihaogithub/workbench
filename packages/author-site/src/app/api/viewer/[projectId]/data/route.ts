import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  readProjectMeta,
  listDemoPages,
  getDemoDirPath,
  getProjectConfigSchema,
  getProjectConfigValues,
  readAppGraph,
  validateAppGraph,
} from "@/lib/fs-utils";
import { type PreviewSize, extractPreviewSize } from "@/lib/preview-size";
import { readCanvasStateFromWorkspace } from "@/lib/canvas-layout-file";
import { extractDeclaredRegionIds, parseVisibilityRules } from "@workbench/shared";

function collectRegionIds(contents: string[]): string[] {
  return extractDeclaredRegionIds(contents);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const project = readProjectMeta(projectId);
    const workspacePath = path.join(getProjectPath(projectId), "workspace");
    const demoPages = listDemoPages(workspacePath);

    const pages = demoPages.map((page) => {
      const demoDir = getDemoDirPath(workspacePath, page.id);
      const codePath = path.join(demoDir, "index.tsx");
      const schemaPath = path.join(demoDir, "config.schema.json");
      const prototypeHtmlPath = path.join(demoDir, "prototype.html");
      const prototypeCssPath = path.join(demoDir, "prototype.css");
      const prototypeMetaPath = path.join(demoDir, "prototype.meta.json");
      const sketchScenePath = path.join(demoDir, "sketch.scene.json");
      const sketchMetaPath = path.join(demoDir, "sketch.meta.json");
      const sandboxHtmlPath = path.join(demoDir, "sandbox.html");
      const htmlImportMetaPath = path.join(demoDir, "html-import.meta.json");
      const requirementsPath = path.join(demoDir, "requirements.md");

      let code = "";
      let schema: string | undefined;
      let previewSize: PreviewSize | undefined;
      let prototypeHtml: string | undefined;
      let prototypeCss: string | undefined;
      let prototypeMeta: Record<string, unknown> | undefined;
      let sketchScene: Record<string, unknown> | undefined;
      let sketchMeta: Record<string, unknown> | undefined;
      let htmlImportMeta: Record<string, unknown> | undefined;
      const requirements = fs.existsSync(requirementsPath)
        ? fs.readFileSync(requirementsPath, "utf-8")
        : undefined;

      if (fs.existsSync(codePath)) {
        code = fs.readFileSync(codePath, "utf-8");
      }
      if (fs.existsSync(schemaPath)) {
        schema = fs.readFileSync(schemaPath, "utf-8");
        previewSize = extractPreviewSize(schema);
      }
      if (fs.existsSync(prototypeHtmlPath)) {
        prototypeHtml = fs.readFileSync(prototypeHtmlPath, "utf-8");
      }
      if (fs.existsSync(prototypeCssPath)) {
        prototypeCss = fs.readFileSync(prototypeCssPath, "utf-8");
      }
      if (fs.existsSync(prototypeMetaPath)) {
        try {
          prototypeMeta = JSON.parse(
            fs.readFileSync(prototypeMetaPath, "utf-8"),
          ) as Record<string, unknown>;
        } catch {
          prototypeMeta = undefined;
        }
      }
      if (fs.existsSync(sketchScenePath)) {
        try {
          sketchScene = JSON.parse(
            fs.readFileSync(sketchScenePath, "utf-8"),
          ) as Record<string, unknown>;
        } catch {
          sketchScene = undefined;
        }
      }
      if (fs.existsSync(sketchMetaPath)) {
        try {
          sketchMeta = JSON.parse(
            fs.readFileSync(sketchMetaPath, "utf-8"),
          ) as Record<string, unknown>;
        } catch {
          sketchMeta = undefined;
        }
      }
      // sandbox.html is executable source and must never be included in the
      // general viewer data response. Only expose its audited metadata; the
      // published execution endpoint signs a short-lived iframe ticket on
      // demand after validating the private source manifest.
      if (page.runtimeType === "sandboxed-html" && fs.existsSync(sandboxHtmlPath) && fs.existsSync(htmlImportMetaPath)) {
        try {
          htmlImportMeta = JSON.parse(fs.readFileSync(htmlImportMetaPath, "utf-8")) as Record<string, unknown>;
        } catch {
          htmlImportMeta = undefined;
        }
      }

      return {
        ...page,
        regionIds: collectRegionIds([code, prototypeHtml ?? ""]),
        code,
        schema,
        previewSize,
        prototypeHtml,
        prototypeCss,
        prototypeMeta,
        sketchScene,
        sketchMeta,
        htmlImportMeta,
        requirements,
      };
    });

    const projectConfigSchema =
      getProjectConfigSchema(workspacePath) ?? undefined;
    const projectConfigValues =
      getProjectConfigValues(workspacePath) ?? undefined;
    const canvasState = readCanvasStateFromWorkspace(workspacePath);
    const appGraph = readAppGraph(workspacePath);
    const appGraphValidation = validateAppGraph(appGraph);
    let visibilityRules: ReturnType<typeof parseVisibilityRules>;
    const visibilityRulesPath = path.join(workspacePath, "project.visibility-rules.json");
    if (fs.existsSync(visibilityRulesPath)) {
      visibilityRules = parseVisibilityRules(fs.readFileSync(visibilityRulesPath, "utf-8"));
    }

    return NextResponse.json(
      createApiSuccess({
        project: project
          ? {
              id: project.id,
              name: project.name,
              description: project.description,
            }
          : null,
        demoPages: pages,
        projectConfigSchema,
        projectConfigValues,
        canvasState,
        appGraph,
        appGraphValidation,
        visibilityRules,
      }),
    );
  } catch (error) {
    console.error("Error getting viewer data:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取预览数据失败"),
      { status: 500 },
    );
  }
}
