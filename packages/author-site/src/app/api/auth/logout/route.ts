import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth/jwt";
import { createApiSuccess } from "@/lib/fs-utils";

export async function POST() {
  clearAuthCookie();
  return NextResponse.json(createApiSuccess({ message: "已登出" }));
}
