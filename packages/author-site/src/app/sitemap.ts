import type { MetadataRoute } from "next";

import { MANUAL_ARTICLES } from "@/content/manual/manifest";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_AUTHOR_SITE_URL || "http://localhost:4200").replace(/\/$/, "");
  return [
    { url: `${baseUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/manual`, changeFrequency: "weekly", priority: 0.9 },
    ...MANUAL_ARTICLES.map((article) => ({
      url: `${baseUrl}/manual/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
