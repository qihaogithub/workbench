/**
 * Next.js Instrumentation Hook
 * 用于服务器端定时任务（如 Session 清理）
 *
 * Next.js 会自动加载此约定文件；无需配置 experimental flag。
 */

let cleanupInterval: NodeJS.Timeout | null = null;

export async function register() {
  // 仅在 Node.js 运行时注册（非 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resolveSecrets } = await import('@workbench/runtime-config/secrets');
    resolveSecrets({
      required: [
        'JWT_SECRET',
        'MODEL_CONFIG_ENCRYPTION_KEY',
        'EXTERNAL_AUTH_ENCRYPTION_KEY',
        'INTERNAL_API_TOKEN',
        'ADMIN_SECRET',
      ],
    });
    const { cleanupAllExpiredSessions } = await import('@/lib/session-manager');
    const { cleanupOrphanWorkspaces } = await import('@/lib/workspace-manager');
    const { getProjectAdminService } = await import('@/lib/project-admin-service');
    const { scheduleStartupBackendProvidersSync } = await import('@/lib/backend-providers-sync');
    const { scheduleStartupImageGenSync } = await import('@/lib/image-gen-sync');
    const { cleanupEditorDiagnosticsRetention } = await import('@/lib/editor-diagnostics/retention');

    // 启动时立即执行一次清理
    try {
      const cleaned = cleanupAllExpiredSessions();
      if (cleaned.length > 0) {
        console.log(`[Session Cleanup] Initial cleanup: ${cleaned.length} sessions removed`);
      }
      const orphaned = cleanupOrphanWorkspaces();
      if (orphaned.length > 0) {
        console.log(`[Workspace GC] Initial cleanup: ${orphaned.length} orphan workspaces removed`);
      }
      const trashed = getProjectAdminService().purgeExpiredTrashedProjects();
      if (trashed > 0) {
        console.log(`[Project Trash] Initial cleanup: ${trashed} expired projects purged`);
      }
      const diagnostics = await cleanupEditorDiagnosticsRetention();
      if (diagnostics.sqliteRowsRemoved > 0 || diagnostics.fallbackLinesRemoved > 0) {
        console.log(
          `[Diagnostics Retention] Initial cleanup: ${diagnostics.sqliteRowsRemoved} SQLite rows and ${diagnostics.fallbackLinesRemoved} fallback lines removed`,
        );
      }
    } catch (error) {
      console.error('[Cleanup] Initial cleanup failed:', error);
    }

    scheduleStartupBackendProvidersSync();
    scheduleStartupImageGenSync();

    // 每 30 分钟执行一次全局清理
    cleanupInterval = setInterval(() => {
      try {
        const cleaned = cleanupAllExpiredSessions();
        if (cleaned.length > 0) {
          console.log(`[Session Cleanup] Cleaned ${cleaned.length} expired sessions`);
        }
        const orphaned = cleanupOrphanWorkspaces();
        if (orphaned.length > 0) {
          console.log(`[Workspace GC] Cleaned ${orphaned.length} orphan workspaces`);
        }
        const trashed = getProjectAdminService().purgeExpiredTrashedProjects();
        if (trashed > 0) {
          console.log(`[Project Trash] Purged ${trashed} expired projects`);
        }
        void cleanupEditorDiagnosticsRetention().then((diagnostics) => {
          if (diagnostics.sqliteRowsRemoved > 0 || diagnostics.fallbackLinesRemoved > 0) {
            console.log(
              `[Diagnostics Retention] Purged ${diagnostics.sqliteRowsRemoved} SQLite rows and ${diagnostics.fallbackLinesRemoved} fallback lines`,
            );
          }
        }).catch((error) => {
          console.error('[Diagnostics Retention] Scheduled cleanup failed:', error);
        });
      } catch (error) {
        console.error('[Cleanup] Scheduled cleanup failed:', error);
      }
    }, 30 * 60 * 1000); // 30 分钟
    cleanupInterval?.unref?.();

    console.log('[Session Cleanup] Scheduled cleanup interval: every 30 minutes');
  }
}
