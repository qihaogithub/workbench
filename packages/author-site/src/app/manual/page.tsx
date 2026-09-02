import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ManualIndex } from "@/components/manual/manual-index";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getManualSections, MANUAL_VERSION } from "@/content/manual/manifest";

export const metadata: Metadata = {
  title: "用户手册 | OneFlow",
  description: "OneFlow 创作端的公开使用手册，涵盖项目创作、AI、配置、预览、协同、版本和发布集成。",
};

export default function ManualIndexPage() {
  const sections = getManualSections();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b border-white/10 px-4 pb-14 pt-16 sm:px-6 lg:px-8 lg:pb-20 lg:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-medium text-cyan-300">OneFlow 用户手册 · {MANUAL_VERSION}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">从第一次登录到正式交付</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              用一套公开、精选、持续更新的文档，了解 OneFlow 的创作工作流和每个关键能力。
            </p>
          </div>
        </section>
        <section className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-14 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-6 sm:p-8">
              <p className="text-sm font-medium text-violet-200">推荐阅读路径</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["从零开始", "quick-start", "先完成第一次预览"],
                  ["开始创作", "ai-creation", "让 AI 协助你的第一轮迭代"],
                  ["准备交付", "publish-share-embed", "了解发布、分享和嵌入"],
                ].map(([label, slug, description]) => (
                  <Link key={slug} href={`/manual/${slug}`} className="group rounded-xl border border-white/10 bg-background/60 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">{description}</span>
                    <ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-cyan-200" />
                  </Link>
                ))}
              </div>
            </div>
            <ManualIndex sections={sections} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
