'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { projectApiClient } from '@/lib/project-api';
import type { VersionHistoryResponse, VersionInfo } from '@opencode-workbench/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UsernameDisplay } from '@/components/username-selector';
import { getCurrentUsername } from '@/components/username-selector';
import {
  ArrowLeft,
  History,
  RotateCcw,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  Clock,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function VersionHistoryPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [versionHistory, setVersionHistory] = useState<VersionHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const username = getCurrentUsername();

  // 加载版本历史
  const loadVersionHistory = async () => {
    try {
      const data = await projectApiClient.getVersionHistory(params.id);
      setVersionHistory(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载版本历史失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersionHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // 恢复版本
  const handleRestoreVersion = async (version: VersionInfo) => {
    if (!username) {
      setError('请先设置用户名');
      return;
    }

    if (!confirm(`确定要恢复到 ${version.versionId} 吗？当前状态将被保存为新版本。`)) {
      return;
    }

    setRestoring(version.versionId);
    setError(null);
    setSuccess(null);

    try {
      const result = await projectApiClient.restoreVersion(params.id, {
        versionId: version.versionId,
        username,
      });

      setSuccess(`已成功恢复到新版本 ${result.newVersionId}`);

      // 重新加载版本历史
      await loadVersionHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复版本失败');
    } finally {
      setRestoring(null);
    }
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    return format(timestamp, 'yyyy-MM-dd HH:mm', { locale: zhCN });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      {/* 页面头部 */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <History className="h-7 w-7" />
              版本历史
            </h1>
            {username && (
              <div className="mt-2">
                <UsernameDisplay username={username} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 错误/成功提示 */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200 mb-6">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* 当前版本信息 */}
      {versionHistory && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>当前版本</CardTitle>
            <CardDescription>
              项目最新版本号
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="text-lg">
              {versionHistory.currentVersion}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* 版本列表 */}
      {versionHistory && versionHistory.versions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <History className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">暂无版本历史</h2>
            <p className="text-muted-foreground">
              保存项目编辑后会创建版本记录
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {versionHistory?.versions.map((version, index) => {
            const isLatest = index === 0;

            return (
              <Card key={version.versionId} className={isLatest ? 'border-primary/20' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {version.versionId}
                        {isLatest && (
                          <Badge variant="default">最新</Badge>
                        )}
                        {version.sessionId === 'restore' && (
                          <Badge variant="secondary">恢复版本</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(version.savedAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {version.savedBy}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {version.fileCount} 个文件
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {version.note && (
                    <div className="mb-4 p-3 bg-muted rounded-md">
                      <p className="text-sm">
                        <span className="font-medium">备注：</span>
                        {version.note}
                      </p>
                    </div>
                  )}
                  <Button
                    variant={isLatest ? 'secondary' : 'default'}
                    size="sm"
                    onClick={() => handleRestoreVersion(version)}
                    disabled={restoring === version.versionId || isLatest}
                    className="gap-2"
                  >
                    {restoring === version.versionId ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        恢复中...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        恢复到此版本
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 底部提示 */}
      {versionHistory && (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            共 {versionHistory.totalVersions} 个版本
            {versionHistory.totalVersions >= 50 && '（已保留最多 50 个版本）'}
          </p>
          <p className="mt-1">
            💡 恢复版本会创建新版本，不会丢失当前内容
          </p>
        </div>
      )}
    </div>
  );
}
