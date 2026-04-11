/**
 * Next.js Instrumentation Hook
 * 用于服务器端定时任务（如 Session 清理）
 *
 * 注意：需要在 next.config.js 中启用：
 * experimental: { instrumentationHook: true }
 */

let cleanupInterval: NodeJS.Timeout | null = null;

export async function register() {
  // 仅在 Node.js 运行时注册（非 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { cleanupAllExpiredSessions } = await import('@/lib/session-manager');

    // 启动时立即执行一次清理
    try {
      const cleaned = cleanupAllExpiredSessions();
      if (cleaned.length > 0) {
        console.log(`[Session Cleanup] Initial cleanup: ${cleaned.length} sessions removed`);
      }
    } catch (error) {
      console.error('[Session Cleanup] Initial cleanup failed:', error);
    }

    // 每 30 分钟执行一次全局清理
    cleanupInterval = setInterval(() => {
      try {
        const cleaned = cleanupAllExpiredSessions();
        if (cleaned.length > 0) {
          console.log(`[Session Cleanup] Cleaned ${cleaned.length} expired sessions`);
        }
      } catch (error) {
        console.error('[Session Cleanup] Scheduled cleanup failed:', error);
      }
    }, 30 * 60 * 1000); // 30 分钟

    console.log('[Session Cleanup] Scheduled cleanup interval: every 30 minutes');
  }
}
