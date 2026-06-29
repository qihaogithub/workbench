import { NextRequest, NextResponse } from "next/server";
import { verifyUserPassword } from "@/lib/user";
import { createToken, setAuthCookie } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const normalizedUsername =
      typeof username === "string" ? username.trim() : username;

    if (!normalizedUsername || !password) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "用户名和密码不能为空"),
        { status: 400 },
      );
    }

    const user = await verifyUserPassword(normalizedUsername, password);
    if (!user) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "用户名或密码错误"),
        { status: 401 },
      );
    }

    const token = await createToken({
      userId: user.id,
      username: user.username,
    });
    setAuthCookie(token);

    return NextResponse.json(
      createApiSuccess({
        user: { id: user.id, username: user.username },
      }),
    );
  } catch (error) {
    console.error("[Login] Error:", error);
    return NextResponse.json(
      createApiError("AGENT_SERVICE_ERROR", "登录失败"),
      {
        status: 500,
      },
    );
  }
}
