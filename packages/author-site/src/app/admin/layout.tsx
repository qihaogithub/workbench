/**
 * 管理后台布局
 *
 * 提供侧边栏导航和主内容区布局
 */

import Link from "next/link";
import { Settings, Database, Users, Bot, BookOpen } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950">
      {/* 顶部导航栏 */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-indigo-400" />
              <h1 className="text-xl font-bold text-neutral-50">管理后台</h1>
            </div>
            <div className="text-sm text-neutral-500">管理系统</div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* 侧边栏导航 */}
          <aside className="w-64 shrink-0">
            <nav className="space-y-2">
              <Link
                href="/admin"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100"
              >
                <Settings className="h-5 w-5" />
                概览
              </Link>
              <Link
                href="/admin/models"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100"
              >
                <Bot className="h-5 w-5" />
                AI 模型管理
              </Link>
              <Link
                href="/admin/users"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100"
              >
                <Users className="h-5 w-5" />
                用户管理
              </Link>
              <Link
                href="/admin/knowledge"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100"
              >
                <BookOpen className="h-5 w-5" />
                内置知识库
              </Link>
            </nav>
          </aside>

          {/* 主内容区 */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
