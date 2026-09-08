import { DocumentApplicationError } from "@workbench/project-core/documents";
import { documentErrorResponse } from "./document-application-service";

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: jest.fn(),
}));

describe("documentErrorResponse", () => {
  it("透传备份缺失码和资源详情并返回 503", () => {
    const response = documentErrorResponse(new DocumentApplicationError({
      code: "DOCUMENT_AUTHORITY_BACKUP_MISSING",
      message: "Committed Workspace backup is missing or untrusted",
      details: { path: "knowledge/Rules.md", hash: "missing-hash" },
    }));

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "DOCUMENT_AUTHORITY_BACKUP_MISSING",
        message: "Committed Workspace backup is missing or untrusted",
        details: { path: "knowledge/Rules.md", hash: "missing-hash" },
      },
    });
  });
});
