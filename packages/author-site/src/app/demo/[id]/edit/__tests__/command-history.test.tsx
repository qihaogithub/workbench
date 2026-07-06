import { act, renderHook } from "@testing-library/react";
import {
  shouldIgnoreGlobalUndoRedoEvent,
  useCommandHistory,
} from "../hooks/useCommandHistory";

describe("useCommandHistory", () => {
  it("执行、撤回和重做命令", async () => {
    const events: string[] = [];
    const { result } = renderHook(() => useCommandHistory());

    await act(async () => {
      await result.current.executeCommand({
        label: "测试命令",
        redo: () => {
          events.push("redo");
        },
        undo: () => {
          events.push("undo");
        },
      });
    });

    expect(events).toEqual(["redo"]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    await act(async () => {
      await result.current.undo();
    });

    expect(events).toEqual(["redo", "undo"]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redo();
    });

    expect(events).toEqual(["redo", "undo", "redo"]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("重做失败时保留 redo 栈并上报错误", async () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCommandHistory({ onError }));

    await act(async () => {
      await result.current.executeCommand({
        label: "可撤回命令",
        redo: jest.fn(),
        undo: jest.fn(),
      });
      await result.current.undo();
    });

    const failingRedo = jest.fn(() => {
      throw new Error("重做失败");
    });
    result.current.recordCommand({
      label: "失败命令",
      redo: failingRedo,
      undo: jest.fn(),
    });
    await act(async () => {
      await result.current.undo();
    });

    await act(async () => {
      await result.current.redo();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ label: "失败命令" }),
      "redo",
    );
    expect(result.current.canRedo).toBe(true);
  });

  it("reset 清空撤回和重做栈", async () => {
    const { result } = renderHook(() => useCommandHistory());

    await act(async () => {
      await result.current.executeCommand({
        label: "测试命令",
        redo: jest.fn(),
        undo: jest.fn(),
      });
      await result.current.undo();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("输入控件内保留浏览器原生撤回快捷键", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });

    expect(shouldIgnoreGlobalUndoRedoEvent(event)).toBe(true);
    input.remove();
  });
});
