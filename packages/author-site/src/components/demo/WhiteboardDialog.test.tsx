import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createDefaultSketchScene } from "@workbench/sketch-core";
import type { WhiteboardDocument } from "@workbench/shared";
import { WhiteboardDialog } from "./WhiteboardDialog";

jest.mock("@workbench/sketch-react", () => ({
  SketchEditorSurface: ({
    scene,
    onSceneChange,
    profile,
  }: {
    scene: { nodes?: Array<{ id: string }> };
    onSceneChange: (next: unknown) => void;
    profile?: string;
  }) => (
    <div>
      <output data-testid="editor-profile">{profile}</output>
      <output data-testid="scene-node-ids">
        {(scene.nodes ?? []).map((node) => node.id).join(",")}
      </output>
      <button
        type="button"
        onClick={() => onSceneChange({ ...scene, nodes: [] })}
      >
        修改场景
      </button>
    </div>
  ),
}));

const document: WhiteboardDocument = {
  id: "wb_existing",
  version: 1,
  scene: createDefaultSketchScene(),
  editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
  updatedAt: 1,
};

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof WhiteboardDialog>> = {},
) {
  const onOpenChange = jest.fn();
  const onCommitted = jest.fn();
  const onDiagnosticEvent = jest.fn();
  render(
    <WhiteboardDialog
      open
      projectId="project_1"
      sessionId="session_1"
      target={{ scope: "page", pageId: "page_1", fieldPath: "heroImage" }}
      initialDocument={document}
      onOpenChange={onOpenChange}
      onCommitted={onCommitted}
      onDiagnosticEvent={onDiagnosticEvent}
      {...overrides}
    />,
  );
  return { onOpenChange, onCommitted, onDiagnosticEvent };
}

describe("WhiteboardDialog", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("uses the shared whiteboard editor profile", () => {
    renderDialog();

    expect(screen.getByTestId("editor-profile")).toHaveTextContent("whiteboard");
  });

  it("starts a new whiteboard with the title but without the factory note", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { binding: null, document: null, documentRevision: 0 },
      }),
    });

    renderDialog({ initialDocument: undefined });

    await waitFor(() =>
      expect(screen.getByTestId("scene-node-ids")).toHaveTextContent("title"),
    );
    expect(screen.getByTestId("scene-node-ids")).not.toHaveTextContent("note");
    expect(screen.getByTestId("scene-node-ids")).toHaveTextContent("title");
  });

  it("protects a dirty draft when the dialog is closed", () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "修改场景" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByText("放弃未回填的修改？")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "放弃并关闭" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("guards Escape when a local draft is dirty", () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "修改场景" }));
    fireEvent.keyDown(globalThis.document.body, { key: "Escape" });

    expect(screen.getByText("放弃未回填的修改？")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("does not close the host dialog for Escape from an inner sketch overlay", () => {
    const { onOpenChange } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "配置图片白板" });
    const innerOverlay = globalThis.document.createElement("div");
    innerOverlay.dataset.sketchEscapeScope = "local";
    dialog.appendChild(innerOverlay);

    fireEvent.keyDown(innerOverlay, { key: "Escape" });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "配置图片白板" })).toBeInTheDocument();
  });

  it("submits the full V3 scene and returns committed config values", async () => {
    const { onOpenChange, onCommitted, onDiagnosticEvent } = renderDialog();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { values: { heroImage: "assets/whiteboards/a.png" } },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/project_1/whiteboards/commit",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const commitRequest = (global.fetch as jest.Mock).mock
      .calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(commitRequest.body))).toMatchObject({
      baseDocumentRevision: 0,
      document: { version: 3, sceneFormat: "sketch-scene-v1", documentRevision: 0 },
    });
    expect(JSON.parse(String(commitRequest.body))).not.toHaveProperty("pngBase64");
    expect(onCommitted).toHaveBeenCalledWith(
      expect.objectContaining({ fieldPath: "heroImage" }),
      { heroImage: "assets/whiteboards/a.png" },
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "whiteboard.commit.completed" }),
    );
  });

  it("removes semantics for deleted nodes before a later commit", async () => {
    const imageDocument: WhiteboardDocument = {
      id: "wb_deleted_image",
      version: 3,
      sceneFormat: "sketch-scene-v1",
      documentRevision: 1,
      scene: {
        version: 1,
        pageSize: { width: 100, height: 100 },
        nodes: [
          {
            id: "hero",
            type: "image",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            src: "/api/images/img_hero",
          },
        ],
        assets: [],
        bindings: {},
        metadata: {},
      },
      nodeSemantics: { hero: { assetRef: "img_hero" } },
      editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
      updatedAt: 1,
    };
    renderDialog({ initialDocument: imageDocument });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { values: { heroImage: "assets/whiteboards/a.png" } },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "修改场景" }));
    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const commitRequest = (global.fetch as jest.Mock).mock.calls[0]?.[1] as RequestInit;
    const commitBody = JSON.parse(String(commitRequest.body));
    expect(commitBody.document.scene.nodes).toEqual([]);
    expect(commitBody.document.nodeSemantics).toEqual({});
  });

  it("leaves loading after React Strict Mode restarts the initial read effect", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { document: null } }),
    });
    render(
      <StrictMode>
        <WhiteboardDialog
          open
          projectId="project_1"
          sessionId="session_1"
          target={{ scope: "page", pageId: "page_1", fieldPath: "heroImage" }}
          onOpenChange={jest.fn()}
          onCommitted={jest.fn()}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("正在载入白板…")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "回填图片" })).toBeEnabled();
  });

  it("uses a null base revision for the first commit of an unbound whiteboard", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { binding: null, document: null, documentRevision: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { values: { heroImage: "assets/whiteboards/a.png" } },
        }),
      });
    renderDialog({ initialDocument: undefined });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "回填图片" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(2),
    );
    const commitBody = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[1]?.[1]?.body),
    );
    expect(commitBody.baseDocumentRevision).toBeNull();
  });

  it("keeps the draft open and exposes a retryable error after a failed commit", async () => {
    renderDialog();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: "图片列表已变化" },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "图片列表已变化",
    );
    expect(screen.getByRole("button", { name: "回填图片" })).toBeEnabled();
  });

  it("imports constrained code into the private draft before commit", () => {
    const { onDiagnosticEvent } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "代码导入/导出" }));
    fireEvent.change(screen.getByLabelText("白板 HTML 代码"), {
      target: {
        value:
          '<main data-sketch-canvas="v1" data-width="100" data-height="100"><div data-sketch-id="box" data-sketch-kind="rect"></div></main>',
      },
    });
    fireEvent.change(screen.getByLabelText("白板 CSS 代码"), {
      target: {
        value:
          '[data-sketch-id="box"] { left:0; top:0; width:20px; height:20px; }',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "导入到白板" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("有未回填的本地修改")).toBeInTheDocument();
    expect(onDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "whiteboard.code_import.completed" }),
    );
  });

  it("shows Chinese diagnostics when code import is rejected", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "代码导入/导出" }));
    fireEvent.change(screen.getByLabelText("白板 HTML 代码"), {
      target: {
        value:
          '<main data-sketch-canvas="v1" data-width="100" data-height="100"><div data-sketch-id="box" data-sketch-kind="rect">不支持的文本</div></main>',
      },
    });
    fireEvent.change(screen.getByLabelText("白板 CSS 代码"), {
      target: {
        value:
          '[data-sketch-id="box"] { left:0; top:0; width:20px; height:20px; }',
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "导入到白板" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "图形节点不能包含文本内容",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "nodes cannot contain text content",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "UNSUPPORTED_NODE_CONTENT",
    );
  });

  it("localizes temporary image data before persisting the document", async () => {
    const imageDocument: WhiteboardDocument = {
      id: "wb_image",
      version: 2,
      documentRevision: 0,
      scene: {
        version: 1,
        pageSize: { width: 100, height: 100 },
        nodes: [
          {
            id: "hero",
            type: "image",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          },
        ],
        assets: [
          {
            id: "library-image",
            type: "image",
            src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          },
        ],
        bindings: {},
        metadata: {},
      },
      nodeSemantics: {},
      editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
      updatedAt: 1,
    };
    renderDialog({ initialDocument: imageDocument });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { imageId: "img_local", url: "/api/images/img_local" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { values: { heroImage: "assets/whiteboards/a.png" } },
        }),
      });

    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const commitBody = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[1]?.[1]?.body),
    );
    expect(commitBody.document.scene.nodes[0].src).toBe(
      "/api/images/img_local",
    );
    expect(commitBody.document.scene.assets[0].src).toBe(
      "/api/images/img_local",
    );
    expect(commitBody.document.nodeSemantics.hero.assetRef).toBe("img_local");
  });

  it("keeps a managed current image bridge-safe in a new draft", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { binding: null, document: null, documentRevision: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { imageId: "img_source", url: "/api/images/img_source" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { values: { heroImage: "assets/whiteboards/a.png" } },
        }),
      });
    renderDialog({
      initialDocument: undefined,
      target: {
        scope: "page",
        pageId: "page_1",
        fieldPath: "heroImage",
        currentValue: "/api/images/img_source",
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "回填图片" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(3),
    );
    const commitBody = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[2]?.[1]?.body),
    );
    const sourceNode = commitBody.document.scene.nodes.find(
      (node: { id: string }) => node.id === "source-background",
    );
    expect(sourceNode).toMatchObject({
      type: "image",
      src: "/api/images/img_source",
    });
    expect(sourceNode.name).toBeUndefined();
  });

  it("migrates a legacy bound document with the current image background", async () => {
    const legacyDocument: WhiteboardDocument = {
      id: "wb_legacy_background",
      version: 2,
      documentRevision: 3,
      scene: createDefaultSketchScene({ width: 100, height: 100 }),
      nodeSemantics: {},
      editorView: { zoom: 1, offsetX: 0, offsetY: 0 },
      updatedAt: 1,
    };
    renderDialog({
      initialDocument: legacyDocument,
      target: {
        scope: "page",
        pageId: "page_1",
        fieldPath: "heroImage",
        currentValue: "/api/images/img_source",
      },
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            imageId: "img_source",
            assetRef: "img_source",
            url: "/api/images/img_source",
            width: 100,
            height: 100,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { values: { heroImage: "assets/whiteboards/a.png" } },
        }),
      });

    fireEvent.click(screen.getByRole("button", { name: "回填图片" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const commitBody = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[1]?.[1]?.body),
    );
    expect(commitBody.document).toMatchObject({
      version: 3,
      documentRevision: 3,
      nodeSemantics: {
        "source-background": {
          role: "background",
          assetRef: "img_source",
        },
      },
    });
    expect(commitBody.document.scene.nodes[0]).toMatchObject({
      id: "source-background",
      src: "/api/images/img_source",
      width: 100,
      height: 100,
      style: { imageFit: "cover" },
    });
  });
});
