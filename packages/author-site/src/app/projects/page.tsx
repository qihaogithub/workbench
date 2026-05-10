'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { projectApiClient } from '@/lib/project-api';
import type { ProjectListResponse } from '@opencode-workbench/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UsernameSelector, getCurrentUsername, setCurrentUsername, clearCurrentUsername, UsernameDisplay } from '@/components/username-selector';
import { FolderOpen, History, Plus, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 加载项目列表
  const loadProjects = async () => {
    try {
      setRefreshing(true);
      const data = await projectApiClient.getProjects();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // 处理用户名变更
  const handleUsernameChange = (newUsername: string) => {
    setUsername(newUsername);
  };

  // 切换用户
  const handleSwitchUser = () => {
    clearCurrentUsername();
    setUsername(null);
  };

  // 开始编辑项目
  const handleEditProject = async (projectId: string) => {
    if (!username) {
      alert('请先设置用户名');
      return;
    }

    try {
      const result = await projectApiClient.openProjectEdit(projectId, { username });
      // 跳转到编辑页面，传递会话信息
      window.location.href = `/projects/${projectId}/edit?sessionId=${result.sessionId}&basedOn=${result.basedOnVersion}&workspace=${encodeURIComponent(result.tempWorkspace)}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : '打开项目失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* 用户名选择器 */}
      {!username && <UsernameSelector onUsernameChange={handleUsernameChange} />}

      {/* 配置项类型说明 */}
      <div className="mb-8 p-6 bg-card rounded-lg border">
        <h2 className="text-xl font-semibold mb-4">支持的配置项类型</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">📝 字符串 (string)</h3>
            <p className="text-sm text-muted-foreground">文本输入，支持 maxLength、minLength、pattern 等验证</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">🔢 数字 (number/integer)</h3>
            <p className="text-sm text-muted-foreground">数字输入，支持 minimum、maximum 范围限制</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">✅ 布尔 (boolean)</h3>
            <p className="text-sm text-muted-foreground">开关控件，用于启用/禁用功能</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">📋 枚举 (enum)</h3>
            <p className="text-sm text-muted-foreground">下拉选择，从预定义选项中选择</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">📚 数组 (array)</h3>
            <p className="text-sm text-muted-foreground">列表输入，支持动态添加/删除元素</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">🗂️ 对象 (object)</h3>
            <p className="text-sm text-muted-foreground">嵌套结构，支持复杂的配置组合</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">📅 日期 (format: date)</h3>
            <p className="text-sm text-muted-foreground">日期选择器，用于选择日期</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">📧 邮箱 (format: email)</h3>
            <p className="text-sm text-muted-foreground">邮箱输入，自动验证格式</p>
          </div>
          <div className="p-4 border rounded-md">
            <h3 className="font-medium mb-2">🔗 URL (format: uri)</h3>
            <p className="text-sm text-muted-foreground">URL 输入，用于链接和图片地址</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-muted rounded-md">
          <p className="text-sm text-muted-foreground">
            💡 提示：访问 <a href="/demo-test" className="text-primary hover:underline">Demo 测试页面</a> 查看配置面板的实际效果
          </p>
        </div>
      </div>

      {/* 页面头部 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">我的项目</h1>
          {username && (
            <div className="mt-2">
              <UsernameDisplay username={username} onChange={handleSwitchUser} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadProjects}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Link href="/projects/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              新建项目
            </Button>
          </Link>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* 项目列表 */}
      {projects && projects.projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">暂无项目</h2>
          <p className="text-muted-foreground mb-4">
            创建您的第一个项目开始使用
          </p>
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新建项目
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.projects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  {project.name}
                  {typeof project.demoCount === 'number' && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {project.demoCount} 页面
                    </Badge>
                  )}
                </CardTitle>
                {project.description && (
                  <CardDescription>{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">版本</span>
                  <span className="font-medium">{project.currentVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">文件数</span>
                  <span>{project.fileCount} 个</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最后保存</span>
                  <span>
                    {formatDistanceToNow(project.lastSavedAt, {
                      locale: zhCN,
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">保存者</span>
                  <span>{project.lastSavedBy}</span>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => handleEditProject(project.id)}
                >
                  开始编辑
                </Button>
                <Link href={`/projects/${project.id}/versions`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    <History className="h-4 w-4 mr-2" />
                    查看历史
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
