import {
  getKnowledgeUploadTitle,
  isSupportedKnowledgeUpload,
} from "./document-view-knowledge";

describe("document view knowledge uploads", () => {
  it.each(["guide.md", "guide.markdown", "notes.txt", "NOTES.TXT"])(
    "accepts %s",
    (name) => {
      expect(isSupportedKnowledgeUpload({ name } as File)).toBe(true);
    },
  );

  it.each(["guide.pdf", "guide.docx", "guide", "guide.json"])(
    "rejects %s",
    (name) => {
      expect(isSupportedKnowledgeUpload({ name } as File)).toBe(false);
    },
  );

  it("derives a title from the uploaded filename", () => {
    expect(getKnowledgeUploadTitle("project-notes.markdown")).toBe(
      "project-notes",
    );
    expect(getKnowledgeUploadTitle(".txt")).toBe("未命名文档");
  });
});
