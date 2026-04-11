/**
 * Session 目录结构迁移脚本
 *
 * 从旧结构迁移到新结构：
 * 旧: data/sessions/{projectId}/{sessionId}/
 * 新: data/sessions/{userId}/{projectId}/{sessionId}/
 *
 * 使用方法：
 * cd packages/web
 * MIGRATION_DEFAULT_USER_ID="your-user-id" npx ts-node scripts/migrate-sessions.ts
 */

import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

/**
 * 迁移函数：将旧结构迁移到新结构
 * @param defaultUserId 默认用户 ID（用于单用户迁移）
 */
export function migrateSessions(defaultUserId: string): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('[Migration] No sessions directory found');
    return;
  }

  const entries = fs.readdirSync(SESSIONS_DIR);
  let migratedCount = 0;
  let skippedCount = 0;

  console.log(`[Migration] Starting migration with userId: ${defaultUserId}`);

  for (const entry of entries) {
    const oldPath = path.join(SESSIONS_DIR, entry);

    // 跳过文件
    if (!fs.statSync(oldPath).isDirectory()) {
      console.log(`[Migration] Skipping file: ${entry}`);
      skippedCount++;
      continue;
    }

    // 检查是否已经是用户目录（通过检查子目录是否包含 .session.json）
    const subEntries = fs.readdirSync(oldPath, { withFileTypes: true });
    const hasSessionFiles = subEntries.some(
      (sub) =>
        sub.isDirectory() &&
        fs.existsSync(path.join(oldPath, sub.name, '.session.json'))
    );

    // 如果已经是新结构（包含用户 ID 目录），跳过
    if (!hasSessionFiles && subEntries.length > 0) {
      // 检查子目录的子目录是否有 .session.json
      const isAlreadyMigrated = subEntries.some((sub) => {
        if (!sub.isDirectory()) return false;
        const subPath = path.join(oldPath, sub.name);
        const subSubEntries = fs.readdirSync(subPath, { withFileTypes: true });
        return subSubEntries.some(
          (subSub) =>
            subSub.isDirectory() &&
            fs.existsSync(path.join(subPath, subSub.name, '.session.json'))
        );
      });

      if (isAlreadyMigrated) {
        console.log(`[Migration] Already migrated, skipping: ${entry}`);
        skippedCount++;
        continue;
      }
    }

    // 这是旧结构的项目目录，需要移动
    if (hasSessionFiles) {
      const projectId = entry;
      const newPath = path.join(SESSIONS_DIR, defaultUserId, projectId);

      // 创建新的用户目录
      fs.mkdirSync(path.dirname(newPath), { recursive: true });

      // 移动整个项目目录
      fs.renameSync(oldPath, newPath);
      migratedCount++;

      console.log(`[Migration] Moved ${projectId} → ${defaultUserId}/${projectId}`);
    } else {
      console.log(`[Migration] Skipping (no session files): ${entry}`);
      skippedCount++;
    }
  }

  console.log(`[Migration] Complete: ${migratedCount} projects migrated, ${skippedCount} skipped`);
}

// 运行迁移
const DEFAULT_USER_ID = process.env.MIGRATION_DEFAULT_USER_ID;
if (!DEFAULT_USER_ID) {
  console.error('[Migration] Error: MIGRATION_DEFAULT_USER_ID environment variable not set');
  console.error('[Migration] Usage: MIGRATION_DEFAULT_USER_ID="your-user-id" npx ts-node scripts/migrate-sessions.ts');
  process.exit(1);
}

console.log('[Migration] Starting migration...');
try {
  migrateSessions(DEFAULT_USER_ID);
  console.log('[Migration] Migration completed successfully');
} catch (error) {
  console.error('[Migration] Migration failed:', error);
  process.exit(1);
}
