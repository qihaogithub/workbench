import { NextResponse } from "next/server";
import {
  createApiError,
  createApiSuccess,
  listProjectTemplates,
} from "@/lib/fs-utils";

export async function GET() {
  try {
    return NextResponse.json(createApiSuccess(listProjectTemplates()));
  } catch (error) {
    console.error("Error listing templates:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取模板列表失败"),
      { status: 500 },
    );
  }
}
