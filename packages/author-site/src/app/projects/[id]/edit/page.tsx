'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { projectApiClient } from '@/lib/project-api';
import { getAgentClient } from '@/lib/agent-client';
import { AIChat } from '@/components/ai-elements/ai-chat';
import { useToast } from '@/components/ui/toast-provider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UsernameDisplay } from '@/components/username-selector';
import { getCurrentUsername } from '@/components/username-selector';
import {
  ArrowLeft,
  Save,
  X,
  FileText,
  MessageSquare,
  Loader2,
  AlertCircle,
  CheckCircle,
  Bot,
  User,
} from 'lucide-react';
import Link from 'next/link';

interface EditSessionInfo {
  sessionId: string;
  projectId: string;
  basedOnVersion: string;
  username: string;
  tempWorkspace: string;
  workspaceId: string;
}

export default function ProjectEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const basedOn = searchParams.get('basedOn');

  const [sessionInfo, setSessionInfo] = useState<EditSessionInfo | null>(null);
  const [note, setNote] = useState('');
  const [agentSessionId, setAgentSessionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileChanges, setFileChanges] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化会话信息
  useEffect(() => {
    if (!sessionId || !basedOn) {
      setError('会话信息不完整，请重新打开项目');
      return;
    }

    const username = getCurrentUsername();
    if (!username) {
      setError('未设置用户名，请返回项目列表设置用户名');
      return;
    }

    setSessionInfo({
      sessionId,
      projectId: params.id,
      basedOnVersion: basedOn,
      username,
      tempWorkspace: searchParams.get('workspace') || '',
      workspaceId: '',
    });

    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSessionInfo((prev) =>
            prev ? { ...prev, workspaceId: data.data.workspaceId || '' } : prev,
          );
        }
      })
      .catch(() => {});

    // 创建 Agent 会话
    try {
      const agentClient = getAgentClient();
      const newAgentSessionId = `project-${params.id}-${Date.now()}`;
      setAgentSessionId(newAgentSessionId);
    } catch (err) {
      setError('初始化 Agent 会话失败');
    }
  }, [sessionId, basedOn, params.id, searchParams]);

  // 保存变更
  const handleSave = async () => {
    if (!sessionInfo) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await projectApiClient.saveProjectChanges(
        sessionInfo.sessionId,
        sessionInfo.projectId,
        { note: note.trim() || undefined }
      );

      setSuccess(`已成功保存为新版本 ${result.version}`);

      const shouldPublish = confirm('保存成功！当前有未发布变更，是否立即发布到预览端？');
      if (shouldPublish) {
        try {
          const publishResult = await projectApiClient.publishProject(params.id);
          toast({
            title: '发布成功',
            description: `版本 ${publishResult.publishedVersion} 已发布到预览端，共 ${publishResult.demoCount} 个页面`,
          });
        } catch (publishErr) {
          toast({
            title: '发布失败',
            description: publishErr instanceof Error ? publishErr.message : '发布失败',
            variant: 'destructive',
          });
        }
      }

      setTimeout(() => {
        router.push(`/projects/${params.id}/versions`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 放弃编辑
  const handleDiscard = async () => {
    if (!sessionInfo) return;

    if (!confirm('确定要放弃所有编辑吗？此操作不可撤销。')) {
      return;
    }

    try {
      await projectApiClient.discardProjectChanges(
        sessionInfo.sessionId,
        sessionInfo.projectId
      );

      router.push('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : '放弃编辑失败');
    }
  };

  if (!sessionInfo) {
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
    <div className="h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <div className="border-b p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/projects"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
            <div>
              <h1 className="text-xl font-bold">项目编辑</h1>
              <div className="flex items-center gap-4 text-sm mt-1">
                <UsernameDisplay username={sessionInfo.username} />
                <Badge variant="outline">基于 {sessionInfo.basedOnVersion}</Badge>
              </div>
            </div>
          </div>
          <Alert variant="default" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              您正在编辑临时副本，保存后会创建新版本
            </AlertDescription>
          </Alert>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* 左侧：AI 对话区域 */}
        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              AI 助手
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
            <AIChat
              sessionId={sessionInfo.sessionId}
              agentSessionId={agentSessionId}
              workingDir={sessionInfo.tempWorkspace}
              projectId={params.id}
              workspaceId={sessionInfo.workspaceId || undefined}
              currentSessionId={sessionInfo.sessionId}
              onFilesChange={(files) => setFileChanges(files.length)}
              onSelectSession={async (newSessionId) => {
                try {
                  if (sessionInfo.sessionId && sessionInfo.sessionId !== newSessionId) {
                    await fetch(`/api/sessions/${sessionInfo.sessionId}/meta`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "discarded" }),
                    });
                  }

                  await fetch(`/api/sessions/${newSessionId}/meta`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "editing" }),
                  });

                  const sessionRes = await fetch(`/api/sessions/${newSessionId}`);
                  if (!sessionRes.ok) {
                    toast({ title: "会话不存在", variant: "destructive" });
                    return;
                  }
                  const sessionData = await sessionRes.json();
                  if (!sessionData.success || sessionData.data?.isExpired) {
                    toast({ title: "会话已过期", variant: "destructive" });
                    return;
                  }

                  setSessionInfo({
                    sessionId: newSessionId,
                    projectId: params.id,
                    basedOnVersion: sessionInfo.basedOnVersion,
                    username: sessionInfo.username,
                    tempWorkspace: sessionInfo.tempWorkspace,
                    workspaceId: sessionInfo.workspaceId,
                  });
                  setAgentSessionId(`project-${params.id}-${Date.now()}`);
                  toast({ title: "已切换会话" });
                } catch (error) {
                  toast({
                    title: "切换失败",
                    description: error instanceof Error ? error.message : "未知错误",
                    variant: "destructive",
                  });
                }
              }}
              onNewSession={async (existingWorkspaceId) => {
                try {
                  const body: Record<string, unknown> = { demoId: params.id, forceNew: true };
                  if (existingWorkspaceId) {
                    body.workspaceId = existingWorkspaceId;
                  }
                  const res = await fetch("/api/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  const data = await res.json();
                  if (!data.success) {
                    toast({ title: "新建对话失败", variant: "destructive" });
                    return;
                  }
                  setSessionInfo({
                    sessionId: data.data.sessionId,
                    projectId: params.id,
                    basedOnVersion: sessionInfo.basedOnVersion,
                    username: sessionInfo.username,
                    tempWorkspace: data.data.tempWorkspace || "",
                    workspaceId: data.data.workspaceId || "",
                  });
                  setAgentSessionId(`project-${params.id}-${Date.now()}`);
                  toast({ title: "已创建新对话" });
                } catch (error) {
                  toast({
                    title: "新建对话失败",
                    description: error instanceof Error ? error.message : "未知错误",
                    variant: "destructive",
                  });
                }
              }}
            />
          </CardContent>
        </Card>

        {/* 右侧：文件变更状态 */}
        <Card className="w-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              编辑状态
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">文件变更</span>
                <span className="font-medium">{fileChanges} 个文件</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">备注</label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="可选：为此次保存添加备注"
                rows={3}
              />
            </div>

            <div className="pt-4 space-y-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    保存为新版本
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={saving}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                放弃编辑
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
