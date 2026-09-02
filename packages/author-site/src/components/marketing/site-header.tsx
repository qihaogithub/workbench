"use client";

import Link from "next/link";
import { BookOpen, Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050505]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="oneflow-wordmark shrink-0 text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={closeMenu}
        >
          OneFlow
        </Link>

        <nav className="ml-6 hidden flex-1 items-center gap-1 md:flex" aria-label="官网导航">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            首页
          </Link>
          <Link
            href="/manual"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            用户手册
          </Link>
          <Button asChild size="sm" className="ml-auto gap-2">
            <Link href="/workbench">
              进入工作台
              <span aria-hidden="true">→</span>
            </Link>
          </Button>
        </nav>

        <button
          type="button"
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label={menuOpen ? "关闭官网菜单" : "打开官网菜单"}
          aria-expanded={menuOpen}
          aria-controls="mobile-site-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        id="mobile-site-nav"
        className={cn(
          "border-t border-white/[0.08] md:hidden",
          menuOpen ? "block" : "hidden",
        )}
      >
        <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6" aria-label="移动官网导航">
          <Link
            href="/"
            onClick={closeMenu}
            className="rounded-md px-3 py-3 text-sm text-foreground hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            首页
          </Link>
          <Link
            href="/manual"
            onClick={closeMenu}
            className="flex items-center gap-2 rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookOpen className="h-4 w-4" />
            用户手册
          </Link>
          <Link
            href="/workbench"
            onClick={closeMenu}
            className="rounded-md bg-primary px-3 py-3 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            进入工作台
          </Link>
        </nav>
      </div>
    </header>
  );
}
