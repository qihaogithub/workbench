import { NextResponse } from "next/server";

import { createApiSuccess } from "@/lib/fs-utils";
import { readSafeDingtalkLoginConfig } from "@/lib/dingtalk-login";

export async function GET() {
  return NextResponse.json(createApiSuccess(readSafeDingtalkLoginConfig()));
}
