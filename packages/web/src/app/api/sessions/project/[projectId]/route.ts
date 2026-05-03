import { NextRequest, NextResponse } from "next/server";
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
  request: NextRequest,
  { params }: { params: { projectId: string } },
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

    const userId = payload.userId;
    const { projectId } = params;

    const projectSessionsDir = path.join(
      process.env.SESSIONS_DIR || path.join(process.cwd(), "data", "sessions"),
      userId,
      projectId,
    );

    if (!fs.existsSync(projectSessionsDir)) {
      return NextResponse.json(createApiSuccess([]));
    }

    const sessionDirs = fs.readdirSync(projectSessionsDir, {
      withFileTypes: true,
    });

    const sessions = [];

    for (const dir of sessionDirs) {
      if (!dir.isDirectory()) continue;

      const metaPath = path.join(projectSessionsDir, dir.name, ".session.json");
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

        let messageCount = 0;
        let lastMessageAt = meta.createdAt;
        const messagesPath = path.join(projectSessionsDir, dir.name, MESSAGES_FILE);
        if (fs.existsSync(messagesPath)) {
          try {
            const messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"));
            if (Array.isArray(messages)) {
              messageCount = messages.length;
              if (messages.length > 0 && messages[messages.length - 1].timestamp) {
                lastMessageAt = messages[messages.length - 1].timestamp;
              }
            }
          } catch {
            // 忽略消息文件解析错误
          }
        }

        sessions.push({
          sessionId: meta.sessionId,
          demoId: meta.demoId,
          workspaceId: meta.workspaceId || null,
          title: meta.title || null,
          createdAt: meta.createdAt,
          expiresAt: meta.expiresAt,
          isExpired: Date.now() > meta.expiresAt,
          messageCount,
          lastMessageAt,
          hasUnsavedChanges: meta.status === "editing",
        });
      } catch {
        continue;
      }
    }

    sessions.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(createApiSuccess(sessions));
  } catch (error) {
    console.error("Error listing project sessions:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取 Session 列表失败"),
      { status: 500 },
    );
  }
}
