/**
 * 管理后台布局
 *
 * 提供侧边栏导航和主内容区布局
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Settings, Database, Users, Bot } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const navItems = [
    { href: "/admin", label: "概览", icon: Settings },
    { href: "/admin/models", label: "AI 模型管理", icon: Bot },
    { href: "/admin/users", label: "用户管理", icon: Users },
    { href: "/admin/conversation-reliability", label: "AI 对话可靠性", icon: Activity },
  ];
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
            <nav className="space-y-2" aria-label="管理后台导航">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
                return (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${active ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/25" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"}`}>
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* 主内容区 */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
