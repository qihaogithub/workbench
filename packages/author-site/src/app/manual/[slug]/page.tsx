import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ManualArticle } from "@/components/manual/manual-article";
import { getManualArticle, MANUAL_ARTICLES } from "@/content/manual/manifest";

interface ManualArticlePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return MANUAL_ARTICLES.map((article) => ({ slug: article.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: ManualArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getManualArticle(slug);
  if (!article) return { title: "文章不存在 | OneFlow" };
  return {
    title: `${article.title} | OneFlow 用户手册`,
    description: article.description,
  };
}

export default async function ManualArticlePage({ params }: ManualArticlePageProps) {
  const { slug } = await params;
  const article = getManualArticle(slug);
  if (!article) notFound();

  const ordered = [...MANUAL_ARTICLES].sort((a, b) => a.order - b.order);
  const currentIndex = ordered.findIndex((item) => item.slug === article.slug);
  return (
    <ManualArticle
      article={article}
      previous={currentIndex > 0 ? ordered[currentIndex - 1] : undefined}
      next={currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined}
    />
  );
}
