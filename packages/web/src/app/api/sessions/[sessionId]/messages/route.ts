import { NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
  getSessionPath,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import fs from "fs";
import path from "path";

const MESSAGES_FILE = ".messages.json";

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const sessionPath = getSessionPath(sessionId);
    const messagesPath = path.join(sessionPath, MESSAGES_FILE);

    if (!fs.existsSync(messagesPath)) {
      return NextResponse.json(createApiSuccess([]));
    }

    const messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"));
    return NextResponse.json(createApiSuccess(messages));
  } catch (error) {
    console.error("Error reading session messages:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取消息历史失败"),
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const { messages } = await request.json();

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "messages 必须为数组"),
        { status: 400 },
      );
    }

    const sessionPath = getSessionPath(sessionId);
    const messagesPath = path.join(sessionPath, MESSAGES_FILE);

    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2), "utf-8");
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error saving session messages:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "保存消息历史失败"),
      { status: 500 },
    );
  }
}
