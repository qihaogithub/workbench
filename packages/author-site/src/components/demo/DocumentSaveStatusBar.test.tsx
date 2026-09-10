import { render, screen } from "@testing-library/react";
import { DocumentSaveStatusBar } from "./DocumentSaveStatusBar";
import {
  DocumentSaveError,
  type DocumentSaveSnapshot,
} from "@/lib/document-save-coordinator";

function snapshot(
  status: DocumentSaveSnapshot["status"],
  overrides: Partial<DocumentSaveSnapshot> = {},
): DocumentSaveSnapshot {
  return {
    status,
    error: null,
    localRevision: 1,
    committedRevision: 0,
    hasLocalDraft: false,
    ...overrides,
  };
}

describe("DocumentSaveStatusBar", () => {
  it("keeps the normal autosave cycle silent", () => {
    const { rerender } = render(
      <DocumentSaveStatusBar snapshot={snapshot("dirty")} />,
    );

    expect(screen.queryByTestId("document-save-status")).not.toBeInTheDocument();

    for (const status of ["clean", "saving", "saved"] as const) {
      rerender(<DocumentSaveStatusBar snapshot={snapshot(status)} />);
      expect(screen.queryByTestId("document-save-status")).not.toBeInTheDocument();
    }
  });

  it("keeps actionable failures visible with recovery controls", () => {
    const onRetry = jest.fn();
    const onRestoreDraft = jest.fn();
    const onDiscardDraft = jest.fn();

    render(
      <DocumentSaveStatusBar
        snapshot={snapshot("offline", {
          error: new DocumentSaveError("网络暂时不可用，修改已保留在本地。", {
            code: "NETWORK_UNAVAILABLE",
            retryable: true,
          }),
          hasLocalDraft: true,
        })}
        onRetry={onRetry}
        onRestoreDraft={onRestoreDraft}
        onDiscardDraft={onDiscardDraft}
      />,
    );

    expect(screen.getByTestId("document-save-status")).toHaveTextContent(
      "网络暂时不可用",
    );
    expect(screen.getByRole("button", { name: "重试保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "放弃本地草稿" })).toBeInTheDocument();
  });
});
