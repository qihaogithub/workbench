import {
  writeCanvasClipboard,
  readCanvasClipboard,
  computeBounds,
  isEditableTarget,
} from "@workbench/demo-ui";
import type {
  CanvasClipboardData,
  CanvasFreeNode,
  CanvasPageLayout,
} from "@workbench/demo-ui";

// 模拟 localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
});

function makeNode(overrides: Partial<CanvasFreeNode> = {}): CanvasFreeNode {
  return {
    id: "doc-1",
    kind: "document" as const,
    title: "测试文档",
    layout: { x: 100, y: 200, width: 300, height: 400 },
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  } as CanvasFreeNode;
}

function makeClipboardData(
  overrides: Partial<CanvasClipboardData> = {},
): CanvasClipboardData {
  return {
    version: 1,
    copiedAt: Date.now(),
    nodes: [],
    pages: [],
    pageLayouts: {},
    pageGroups: [],
    bounds: null,
    ...overrides,
  };
}

describe("剪贴板工具模块", () => {
  describe("writeCanvasClipboard + readCanvasClipboard 往返一致性", () => {
    it("空数据往返一致", () => {
      const data = makeClipboardData();
      writeCanvasClipboard(data);
      const result = readCanvasClipboard();
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.nodes).toEqual([]);
      expect(result!.pages).toEqual([]);
      expect(result!.pageLayouts).toEqual({});
      expect(result!.pageGroups).toEqual([]);
    });

    it("含节点数据往返一致", () => {
      const node = makeNode();
      const data = makeClipboardData({
        nodes: [node],
        sourceProjectId: "proj-1",
        bounds: { x: 100, y: 200, width: 300, height: 400 },
      });
      writeCanvasClipboard(data);
      const result = readCanvasClipboard();
      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(1);
      expect(result!.nodes[0].id).toBe("doc-1");
      expect(result!.nodes[0].kind).toBe("document");
      expect(result!.sourceProjectId).toBe("proj-1");
      expect(result!.bounds).toEqual({
        x: 100,
        y: 200,
        width: 300,
        height: 400,
      });
    });

    it("localStorage 写入失败时静默失败", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceededError");
      });
      expect(() => writeCanvasClipboard(makeClipboardData())).not.toThrow();
    });
  });

  describe("readCanvasClipboard 无效数据", () => {
    it("空存储返回 null", () => {
      expect(readCanvasClipboard()).toBeNull();
    });

    it("无效 JSON 返回 null", () => {
      localStorageMock.getItem.mockReturnValueOnce("not-json{{{");
      expect(readCanvasClipboard()).toBeNull();
    });

    it("版本不匹配返回 null", () => {
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify({
          version: 2,
          nodes: [],
          pages: [],
          pageLayouts: {},
          pageGroups: [],
        }),
      );
      expect(readCanvasClipboard()).toBeNull();
    });

    it("nodes 不是数组返回 null", () => {
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          nodes: "not-array",
          pages: [],
          pageLayouts: {},
          pageGroups: [],
        }),
      );
      expect(readCanvasClipboard()).toBeNull();
    });

    it("pages 不是数组返回 null", () => {
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          nodes: [],
          pages: 123,
          pageLayouts: {},
          pageGroups: [],
        }),
      );
      expect(readCanvasClipboard()).toBeNull();
    });
  });

  describe("computeBounds", () => {
    it("空选择返回 null", () => {
      expect(computeBounds({}, [])).toBeNull();
    });

    it("仅节点时正确计算", () => {
      const nodes: CanvasFreeNode[] = [
        makeNode({ layout: { x: 10, y: 20, width: 100, height: 50 } }),
        makeNode({
          id: "text-1",
          kind: "text" as const,
          layout: { x: 200, y: 300, width: 50, height: 30 },
        } as CanvasFreeNode),
      ];
      const result = computeBounds({}, nodes);
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 240, // 200 + 50 - 10
        height: 310, // 300 + 30 - 20
      });
    });

    it("仅页面布局时正确计算", () => {
      const layouts: Record<string, CanvasPageLayout> = {
        "page-1": { x: 0, y: 0, width: 375, height: 812 },
        "page-2": { x: 400, y: 0, width: 375, height: 812 },
      };
      const result = computeBounds(layouts, []);
      expect(result).toEqual({
        x: 0,
        y: 0,
        width: 775, // 400 + 375
        height: 812,
      });
    });

    it("页面 + 节点混合计算", () => {
      const layouts: Record<string, CanvasPageLayout> = {
        "page-1": { x: 50, y: 50, width: 200, height: 300 },
      };
      const nodes = [
        makeNode({ layout: { x: 0, y: 0, width: 100, height: 100 } }),
      ];
      const result = computeBounds(layouts, nodes);
      expect(result).toEqual({
        x: 0,
        y: 0,
        width: 250, // max(0+100, 50+200) = 250
        height: 350, // max(0+100, 50+300) = 350
      });
    });
  });

  describe("isEditableTarget", () => {
    it("null 返回 false", () => {
      expect(isEditableTarget(null)).toBe(false);
    });

    it("普通 div 返回 false", () => {
      const div = document.createElement("div");
      expect(isEditableTarget(div)).toBe(false);
    });

    it("input 返回 true", () => {
      const input = document.createElement("input");
      expect(isEditableTarget(input)).toBe(true);
    });

    it("textarea 返回 true", () => {
      const textarea = document.createElement("textarea");
      expect(isEditableTarget(textarea)).toBe(true);
    });

    it("contentEditable 元素返回 true", () => {
      const div = document.createElement("div");
      div.setAttribute("contenteditable", "true");
      expect(isEditableTarget(div)).toBe(true);
    });

    it("input 的子元素返回 true", () => {
      const div = document.createElement("div");
      const input = document.createElement("input");
      div.appendChild(input);
      expect(isEditableTarget(input)).toBe(true);
    });
  });
});
