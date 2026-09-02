import { NextRequest, NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
  getSessionsDir,
} from "@/lib/fs-utils";
import { cleanupExpiredSessions } from "@/lib/session-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import fs from "fs";
import path from "path";

const MESSAGES_FILE = ".messages.json";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const token = await getAuthCookie();
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
    const { projectId } = await params;

    // 列表打开时先做一次当前项目的轻量历史清理，避免等待下一轮定时任务。
    cleanupExpiredSessions(userId, projectId);

    const projectSessionsDir = path.join(
      getSessionsDir(),
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

        let lastMessageAt = meta.createdAt;
        const messagesPath = path.join(projectSessionsDir, dir.name, MESSAGES_FILE);
        if (fs.existsSync(messagesPath)) {
          try {
            const messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"));
            if (Array.isArray(messages)) {
              const messageTimestamps = messages
                .map((message) =>
                  typeof message?.timestamp === "number" ? message.timestamp : 0,
                )
                .filter((timestamp) => timestamp > 0);
              if (messageTimestamps.length > 0) {
                lastMessageAt = Math.max(...messageTimestamps);
              }
            }
          } catch {
            // 忽略消息文件解析错误
          }
        }

        const lastActivityAt = Math.max(
          typeof meta.lastActivityAt === "number" ? meta.lastActivityAt : 0,
          typeof lastMessageAt === "number" ? lastMessageAt : 0,
          typeof meta.createdAt === "number" ? meta.createdAt : 0,
        );

        sessions.push({
          sessionId: meta.sessionId,
          demoId: meta.demoId,
          workspaceId: meta.workspaceId || null,
          title: meta.title || null,
          createdAt: meta.createdAt,
          lastActivityAt,
        });
      } catch {
        continue;
      }
    }

    sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    return NextResponse.json(createApiSuccess(sessions));
  } catch (error) {
    console.error("Error listing project sessions:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取 Session 列表失败"),
      { status: 500 },
    );
  }
}
