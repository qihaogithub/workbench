'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { projectApiClient } from '@/lib/project-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FolderPlus, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('项目名称不能为空');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await projectApiClient.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        workspacePath: workspacePath.trim() || undefined,
      });

      // 创建成功后返回项目列表
      router.push('/projects');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      {/* 返回链接 */}
      <Link
        href="/projects"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        返回项目列表
      </Link>

      {/* 表单卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            新建项目
          </CardTitle>
          <CardDescription>
            创建一个新的项目工作空间
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 错误提示 */}
            {error && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-md">
                {error}
              </div>
            )}

            {/* 项目名称 */}
            <div className="space-y-2">
              <Label htmlFor="name">
                项目名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的网站"
                autoFocus
              />
            </div>

            {/* 项目描述 */}
            <div className="space-y-2">
              <Label htmlFor="description">项目描述</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选：描述项目的用途和内容"
                rows={3}
              />
            </div>

            {/* 初始工作空间路径 */}
            <div className="space-y-2">
              <Label htmlFor="workspacePath">初始工作空间路径</Label>
              <Input
                id="workspacePath"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="可选：本地项目目录的绝对路径"
              />
              <p className="text-sm text-muted-foreground">
                如果已有项目文件，可以在此处填写路径，系统会自动复制
              </p>
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  '创建项目'
                )}
              </Button>
              <Link href="/projects">
                <Button type="button" variant="outline">
                  取消
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
