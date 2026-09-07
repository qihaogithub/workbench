import { afterEach, describe, expect, it } from "vitest";

import { getOfficialHomeUrl } from "@/lib/official-site-url";

const originalAuthorSiteUrl = process.env.NEXT_PUBLIC_AUTHOR_SITE_URL;

afterEach(() => {
  if (originalAuthorSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_AUTHOR_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_AUTHOR_SITE_URL = originalAuthorSiteUrl;
  }
});

describe("getOfficialHomeUrl", () => {
  it("defaults to the local author-site homepage", () => {
    delete process.env.NEXT_PUBLIC_AUTHOR_SITE_URL;

    expect(getOfficialHomeUrl()).toBe("http://localhost:4200/?from=brand");
  });

  it("uses the configured public author-site homepage", () => {
    process.env.NEXT_PUBLIC_AUTHOR_SITE_URL = "https://oneflow.example.com///";

    expect(getOfficialHomeUrl()).toBe("https://oneflow.example.com/?from=brand");
  });
});
