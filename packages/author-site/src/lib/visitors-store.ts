/**
 * 项目访问者存储层
 *
 * 读写 data/projects/<projectId>/visitors.json，
 * 用于浏览端 @候选人列表（按最近浏览时间排序）。
 */
import fs from "fs";
import path from "path";
import type { ProjectVisitor, VisitorStoreData } from "@workbench/shared";
import { getProjectPath } from "./paths";

const VISITORS_FILENAME = "visitors.json";

function getVisitorsPath(projectId: string): string {
  return path.join(getProjectPath(projectId), VISITORS_FILENAME);
}

export function readVisitorStore(projectId: string): VisitorStoreData {
  const filePath = getVisitorsPath(projectId);
  if (!fs.existsSync(filePath)) {
    return { visitors: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as VisitorStoreData;
    if (!Array.isArray(data.visitors)) {
      return { visitors: [] };
    }
    return data;
  } catch {
    return { visitors: [] };
  }
}

function writeVisitorStore(projectId: string, data: VisitorStoreData): void {
  const filePath = getVisitorsPath(projectId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 记录用户访问（更新 lastVisitedAt，不存在则新增）
 */
export function recordVisit(
  projectId: string,
  userId: string,
  name: string,
): ProjectVisitor {
  const data = readVisitorStore(projectId);
  const now = Date.now();
  const existing = data.visitors.find((v) => v.userId === userId);

  if (existing) {
    existing.lastVisitedAt = now;
    existing.name = name;
    writeVisitorStore(projectId, data);
    return existing;
  }

  const visitor: ProjectVisitor = { userId, name, lastVisitedAt: now };
  data.visitors.push(visitor);
  writeVisitorStore(projectId, data);
  return visitor;
}

/**
 * 获取访问者列表，按最近浏览时间降序
 */
export function listVisitors(projectId: string): ProjectVisitor[] {
  const { visitors } = readVisitorStore(projectId);
  return [...visitors].sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
}
