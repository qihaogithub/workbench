import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByUsername } from "@/lib/user";
import { validateUsername, validatePassword } from "@/lib/auth/password";
import { createToken, setAuthCookie } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", usernameValidation.error!),
        { status: 400 },
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", passwordValidation.error!),
        { status: 400 },
      );
    }

    if (findUserByUsername(username)) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "用户名已存在"),
        { status: 409 },
      );
    }

    const user = await createUser({ username, password });
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
    console.error("[Register] Error:", error);
    return NextResponse.json(
      createApiError("AGENT_SERVICE_ERROR", "注册失败"),
      {
        status: 500,
      },
    );
  }
}
