import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import type { ManualArticleMeta } from "@/content/manual/manifest";
import { renderManualMarkdown } from "@/lib/manual/markdown";

interface ManualArticleProps {
  article: ManualArticleMeta;
  previous?: ManualArticleMeta;
  next?: ManualArticleMeta;
}

export function ManualArticle({ article, previous, next }: ManualArticleProps) {
  const { html, headings } = renderManualMarkdown(article.content);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/manual" className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-4 w-4" /> 用户手册
          </Link>
          <span aria-hidden="true">/</span>
          <span>{article.section}</span>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-16">
          <article>
            <header className="border-b border-white/10 pb-8">
              <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-300">
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1">{article.section}</span>
                <span className="text-muted-foreground">更新于 {article.updatedAt}</span>
                <span className="text-muted-foreground">· OneFlow 手册 v1.0</span>
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">{article.title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">{article.description}</p>
            </header>

            {headings.length > 0 ? (
              <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 lg:hidden">
                <summary className="cursor-pointer text-sm font-medium">本文目录</summary>
                <nav className="mt-3 space-y-2" aria-label="本文目录">
                  {headings.map((heading) => (
                    <a key={heading.id} href={`#${heading.id}`} className={`block text-sm text-muted-foreground hover:text-foreground ${heading.level === 3 ? "pl-4" : ""}`}>
                      {heading.text}
                    </a>
                  ))}
                </nav>
              </details>
            ) : null}

            <div className="manual-prose mt-8" dangerouslySetInnerHTML={{ __html: html }} />

            <div className="mt-12 rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-500/15 via-cyan-500/10 to-transparent p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <BookOpen className="mt-1 h-5 w-5 shrink-0 text-violet-200" />
                <div>
                  <h2 className="text-lg font-medium">准备好动手了吗？</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">进入工作台，把本篇内容应用到真实项目中。</p>
                  <Link href="/workbench" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cyan-200 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    进入工作台 <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>

            <nav className="mt-10 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2" aria-label="文章导航">
              {previous ? (
                <Link href={`/manual/${previous.slug}`} className="rounded-xl border border-white/10 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-xs text-muted-foreground">上一篇</span>
                  <span className="mt-2 block text-sm font-medium">{previous.title}</span>
                </Link>
              ) : <span />}
              {next ? (
                <Link href={`/manual/${next.slug}`} className="rounded-xl border border-white/10 p-4 text-right transition-colors hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-xs text-muted-foreground">下一篇</span>
                  <span className="mt-2 flex items-center justify-end gap-2 text-sm font-medium">{next.title} <ArrowRight className="h-4 w-4" /></span>
                </Link>
              ) : null}
            </nav>
          </article>

          {headings.length > 0 ? (
            <aside className="sticky top-24 hidden lg:block">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">本文目录</p>
              <nav className="mt-4 space-y-2 border-l border-white/10 pl-4" aria-label="本文目录">
                {headings.map((heading) => (
                  <a key={heading.id} href={`#${heading.id}`} className={`block text-sm text-muted-foreground transition-colors hover:text-foreground ${heading.level === 3 ? "pl-3 text-xs" : ""}`}>
                    {heading.text}
                  </a>
                ))}
              </nav>
            </aside>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
