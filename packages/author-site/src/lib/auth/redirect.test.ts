import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath } from "./redirect";

describe("getSafeRedirectPath", () => {
  it("accepts an internal pathname and query string", () => {
    expect(getSafeRedirectPath("/demo/project-1/edit?tab=code")).toBe(
      "/demo/project-1/edit?tab=code",
    );
  });

  it.each(["https://example.com", "//example.com", "javascript:alert(1)", "\\\\example.com", "\u0000/workbench", ""]) (
    "rejects unsafe redirect %p",
    (value) => {
      expect(getSafeRedirectPath(value)).toBe(DEFAULT_AUTH_REDIRECT);
    },
  );
});
