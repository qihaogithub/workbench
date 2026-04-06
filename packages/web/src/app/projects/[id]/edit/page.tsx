'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { projectApiClient } from '@/lib/project-api';
import { getAgentClient } from '@/lib/agent-client';
import type { ChatMessage } from '@/components/ui/chat-bubble';
import { ChatBubble } from '@/components/ui/chat-bubble';
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
}

export default function ProjectEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const basedOn = searchParams.get('basedOn');

  const [sessionInfo, setSessionInfo] = useState<EditSessionInfo | null>(null);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
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
    });

    // 创建 Agent 会话
    try {
      const agentClient = getAgentClient();
      const newAgentSessionId = `project-${params.id}-${Date.now()}`;
      setAgentSessionId(newAgentSessionId);

      // 添加欢迎消息
      setAiMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `欢迎！您正在编辑项目（基于 ${basedOn}）。请告诉我您需要做什么？`,
        },
      ]);
    } catch (err) {
      setError('初始化 Agent 会话失败');
    }
  }, [sessionId, basedOn, params.id, searchParams]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // 发送消息到 Agent
  const handleAiSend = async () => {
    if (!message.trim() || isAiLoading || !agentSessionId) return;

    const userMessage = message.trim();
    setMessage('');
    setAiMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: userMessage },
    ]);
    setIsAiLoading(true);
    setError(null);

    try {
      const agentClient = getAgentClient();
      
      const result = await agentClient.sendMessage(agentSessionId, userMessage, {
        workingDir: sessionInfo?.tempWorkspace,
        options: {
          timeout: 120000,
          stream: false,
        },
      });

      if (!result.success) {
        throw new Error(result.error?.message || 'Agent 请求失败');
      }

      const aiReply = result.data?.content || '抱歉，我没有收到有效的回复。';

      setAiMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: aiReply },
      ]);

      // 获取文件变更
      if (result.data?.files) {
        setFileChanges(result.data.files.length);
      }
    } catch (error) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

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

      // 延迟跳转到项目列表
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSend();
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
        <Card className="flex-1 flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              AI 助手
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiMessages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              
              {/* 加载状态 */}
              {isAiLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="border-t p-4 space-y-3">
              {/* 错误/成功提示 */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {success}
                  </AlertDescription>
                </Alert>
              )}

              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入您的请求..."
                disabled={loading}
                rows={3}
              />
              <Button
                onClick={handleAiSend}
                disabled={!message.trim() || isAiLoading}
                className="w-full"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  '发送'
                )}
              </Button>
            </div>
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
