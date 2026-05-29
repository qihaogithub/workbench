import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { listAllUsers } from "@/lib/user";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";

export async function GET(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
    });
  }

  const users = listAllUsers();
  return NextResponse.json(createApiSuccess({ users }));
}
