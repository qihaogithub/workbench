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
  readAppGraph,
  validateAppGraph,
} from "@/lib/fs-utils";
import { type PreviewSize, extractPreviewSize } from "@/lib/preview-size";
import { readCanvasStateFromWorkspace } from "@/lib/canvas-layout-file";

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { projectId } = params;

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

      let code = "";
      let schema: string | undefined;
      let previewSize: PreviewSize | undefined;

      if (fs.existsSync(codePath)) {
        code = fs.readFileSync(codePath, "utf-8");
      }
      if (fs.existsSync(schemaPath)) {
        schema = fs.readFileSync(schemaPath, "utf-8");
        previewSize = extractPreviewSize(schema);
      }

      return {
        ...page,
        code,
        schema,
        previewSize,
      };
    });

    const projectConfigSchema = getProjectConfigSchema(workspacePath) ?? undefined;
    const canvasState = readCanvasStateFromWorkspace(workspacePath);
    const appGraph = readAppGraph(workspacePath);
    const appGraphValidation = validateAppGraph(appGraph);

    return NextResponse.json(
      createApiSuccess({
        project: project
          ? { id: project.id, name: project.name, description: project.description }
          : null,
        demoPages: pages,
        projectConfigSchema,
        canvasState,
        appGraph,
        appGraphValidation,
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
