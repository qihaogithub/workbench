/**
 * 管理后台布局
 *
 * 提供侧边栏导航和主内容区布局
 */

import Link from "next/link";
import { Settings, ListFilter, Database } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold text-gray-900">管理后台</h1>
            </div>
            <div className="text-sm text-gray-500">模型配置管理系统</div>
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
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 text-gray-700"
              >
                <Settings className="h-5 w-5" />
                概览
              </Link>
              <Link
                href="/admin/model-config"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 text-gray-700"
              >
                <ListFilter className="h-5 w-5" />
                模型配置
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
