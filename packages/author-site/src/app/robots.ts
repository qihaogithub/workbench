import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_AUTHOR_SITE_URL || "http://localhost:4200";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/manual", "/manual/"],
      disallow: ["/workbench", "/demo", "/cli", "/login", "/register", "/api/"],
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
