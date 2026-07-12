import path from "path";
import fs from "fs";
import { getSessionPath } from "./paths";

export function getSessionAssetsPath(sessionId: string): string | null {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath) return null;
  return path.join(sessionPath, "assets", "images");
}

export function ensureSessionAssetsDir(sessionId: string): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;
  if (!fs.existsSync(assetsPath)) {
    fs.mkdirSync(assetsPath, { recursive: true });
  }
  return assetsPath;
}

export function generateAssetFilename(originalName: string): string {
  const ext = path.extname(originalName) || ".bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `img_${timestamp}_${random}${ext}`;
}

export function saveSessionAsset(
  sessionId: string,
  filename: string,
  data: Buffer,
): { success: boolean; url?: string; error?: string } {
  try {
    const assetsPath = ensureSessionAssetsDir(sessionId);
    if (!assetsPath) {
      return { success: false, error: "Session 不存在" };
    }

    const filePath = path.join(assetsPath, filename);
    fs.writeFileSync(filePath, data);

    const url = `/api/sessions/${sessionId}/assets/${filename}`;
    return { success: true, url };
  } catch (error) {
    return { success: false, error: `保存文件失败: ${error}` };
  }
}

export function getSessionAssetPath(
  sessionId: string,
  filename: string,
): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;

  const filePath = path.join(assetsPath, filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

export function deleteSessionAsset(
  sessionId: string,
  filename: string,
): boolean {
  const filePath = getSessionAssetPath(sessionId, filename);
  if (!filePath) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function listSessionAssets(sessionId: string): string[] {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath || !fs.existsSync(assetsPath)) return [];

  try {
    return fs.readdirSync(assetsPath).filter((name) => {
      const stat = fs.statSync(path.join(assetsPath, name));
      return stat.isFile();
    });
  } catch {
    return [];
  }
}
