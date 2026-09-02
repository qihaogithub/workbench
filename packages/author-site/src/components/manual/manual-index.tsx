"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { ManualArticleSummary, ManualSection } from "@/content/manual/manifest";

interface ManualSectionGroup {
  section: ManualSection;
  articles: ManualArticleSummary[];
}

interface ManualIndexProps {
  sections: ManualSectionGroup[];
}

export function ManualIndex({ sections }: ManualIndexProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return sections;
    return sections
      .map((group) => ({
        ...group,
        articles: group.articles.filter((article) =>
          [article.title, article.description, ...article.tags]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.articles.length > 0);
  }, [normalizedQuery, sections]);

  return (
    <div>
      <label className="sr-only" htmlFor="manual-search">
        搜索用户手册
      </label>
      <div className="relative mx-auto max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="manual-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题、描述或标签"
          className="h-12 border-white/15 bg-white/[0.05] pl-11 pr-4"
        />
      </div>

      {filteredSections.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
          <p className="text-sm text-muted-foreground">没有找到匹配的文章。</p>
          <button
            type="button"
            className="mt-4 text-sm text-cyan-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setQuery("")}
          >
            清除搜索
          </button>
        </div>
      ) : (
        <div className="mt-14 space-y-12">
          {filteredSections.map((group) => (
            <section key={group.section} aria-labelledby={`manual-section-${group.section}`}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 id={`manual-section-${group.section}`} className="text-xl font-semibold tracking-tight">
                  {group.section}
                </h2>
                <span className="text-xs text-muted-foreground">{group.articles.length} 篇</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {group.articles.map((article) => (
                  <Link
                    key={article.slug}
                    href={`/manual/${article.slug}`}
                    className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-base font-medium group-hover:text-cyan-100">{article.title}</h3>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-cyan-200" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{article.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {article.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
