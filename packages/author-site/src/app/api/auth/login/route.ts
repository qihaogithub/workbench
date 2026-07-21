import { NextRequest, NextResponse } from "next/server";
import { verifyUserPassword } from "@/lib/user";
import { createToken, setAuthCookie, TOKEN_TTL_MS } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function POST(request: NextRequest) {
  try {
    const { username, password, includeToken } = await request.json();
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

    const issuedAt = Date.now();
    const token = await createToken({
      userId: user.id,
      username: user.username,
    });
    setAuthCookie(token);

    return NextResponse.json(
      createApiSuccess({
        user: { id: user.id, username: user.username },
        // CLI 等非浏览器客户端无法读取 httpOnly cookie，显式请求时在 body 返回 token
        ...(includeToken === true
          ? { token, expiresAt: issuedAt + TOKEN_TTL_MS }
          : {}),
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
