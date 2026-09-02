import { MANUAL_ARTICLES, getManualArticle, getManualSections, validateManualManifest } from "./manifest";

describe("manual manifest", () => {
  it("contains unique slugs and complete metadata", () => {
    const slugs = MANUAL_ARTICLES.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const article of MANUAL_ARTICLES) {
      expect(article.title.trim()).not.toBe("");
      expect(article.description.trim()).not.toBe("");
      expect(article.section.trim()).not.toBe("");
      expect(article.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(article.content.trim()).not.toBe("");
    }
  });

  it("fails closed when a manifest contains duplicate or invalid entries", () => {
    expect(() => validateManualManifest([
      { ...MANUAL_ARTICLES[0], slug: "same", order: 1 },
      { ...MANUAL_ARTICLES[1], slug: "same", order: 2 },
    ])).toThrow(/Duplicate/);
    expect(() => validateManualManifest([
      { ...MANUAL_ARTICLES[0], slug: "single", order: 1, content: "[next](/manual/missing)" },
    ])).toThrow(/Unknown manual article link/);
  });

  it("groups articles in stable order and resolves internal links", () => {
    const sections = getManualSections();
    const knownSlugs = new Set(MANUAL_ARTICLES.map((article) => article.slug));
    expect(sections.length).toBeGreaterThan(1);
    for (const article of MANUAL_ARTICLES) {
      expect(getManualArticle(article.slug)).toBe(article);
      const internalLinks = [...article.content.matchAll(/\]\((\/manual\/[^)#?]+)/g)].map(
        (match) => match[1].replace(/^\/manual\//, ""),
      );
      for (const slug of internalLinks) {
        expect(knownSlugs.has(slug)).toBe(true);
      }
    }
    for (const group of sections) {
      expect(group.articles).toEqual([...group.articles].sort((a, b) => a.order - b.order));
    }
  });
});
