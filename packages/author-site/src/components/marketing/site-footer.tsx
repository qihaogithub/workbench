import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-white/[0.08] bg-[#050505]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div>
          <Link
            href="/"
            className="site-footer-link oneflow-wordmark text-lg font-semibold tracking-tight"
          >
            OneFlow
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            面向营销活动业务的 AI
            协作平台，让团队从目标走向可验证的交付，让经验成为下一次活动的起点。
          </p>
        </div>
        <nav
          className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-muted-foreground"
          aria-label="页脚导航"
        >
          <Link
            className="site-footer-link transition-colors hover:text-foreground"
            href="/manual"
          >
            用户手册
          </Link>
          <Link
            className="site-footer-link inline-flex items-center gap-1 transition-colors hover:text-foreground"
            href="/workbench"
          >
            进入工作台 <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            className="site-footer-link transition-colors hover:text-foreground"
            href="/feedback"
          >
            反馈
          </Link>
          <Link
            className="site-footer-link transition-colors hover:text-foreground"
            href="/figma-plugin"
          >
            Figma 插件
          </Link>
        </nav>
      </div>
      <div className="border-t border-white/[0.05] py-4 text-center text-xs text-muted-foreground">
        OneFlow · 创作端
      </div>
    </footer>
  );
}
