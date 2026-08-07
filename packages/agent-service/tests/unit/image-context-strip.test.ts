import { describe, it, expect } from "vitest";
import { stripExpiredImageParts } from "../../src/utils/image-context-strip";

describe("stripExpiredImageParts", () => {
  const imgPart = { type: "image", data: "base64", mimeType: "image/png" };
  const txtPart = { type: "text", text: "请分析这张图" };

  it("空数组返回原引用", () => {
    const msgs: any[] = [];
    expect(stripExpiredImageParts(msgs)).toBe(msgs);
  });

  it("没有 user 消息时返回原引用", () => {
    const msgs = [{ role: "assistant", content: "你好" }];
    expect(stripExpiredImageParts(msgs)).toBe(msgs);
  });

  it("只有一条 user 消息时返回原引用（无历史）", () => {
    const msgs = [
      { role: "user", content: [txtPart, imgPart] },
    ];
    const result = stripExpiredImageParts(msgs);
    expect(result).toBe(msgs);
  });

  it("最后一条 user 消息之前的历史 user 消息中的图片被剥离", () => {
    const msgs = [
      { role: "user", content: [txtPart, imgPart] },
      { role: "assistant", content: "好的" },
      { role: "user", content: [txtPart, imgPart] },
    ];
    const result = stripExpiredImageParts(msgs);
    // 第 0 条 (历史) 应被剥离
    expect(result[0]).not.toBe(msgs[0]);
    expect(result[0].content).toEqual([txtPart]);
    // 第 1 条 (assistant) 无图片，原引用
    expect(result[1]).toBe(msgs[1]);
    // 第 2 条 (最后一条 user) 保持原样
    expect(result[2]).toBe(msgs[2]);
  });

  it("多轮多 user 消息：只保留最后一条 user 的图片", () => {
    const msgs = [
      { role: "user", content: [txtPart, imgPart] },
      { role: "assistant", content: "收到" },
      { role: "user", content: [{ type: "text", text: "第二轮" }, imgPart] },
      { role: "assistant", content: "处理中" },
      { role: "user", content: [{ type: "text", text: "第三轮" }, imgPart] },
    ];
    const result = stripExpiredImageParts(msgs);
    expect(result[0].content).toEqual([txtPart]);
    expect(result[1]).toBe(msgs[1]);
    expect(result[2].content).toEqual([{ type: "text", text: "第二轮" }]);
    expect(result[3]).toBe(msgs[3]);
    expect(result[4]).toBe(msgs[4]);
    expect((result[4].content as any[]).length).toBe(2);
  });

  it("历史 toolResult 消息中的图片也被剥离", () => {
    const msgs = [
      { role: "user", content: "截图" },
      { role: "assistant", content: "好的" },
      {
        role: "toolResult",
        content: [
          { type: "text", text: "截图已保存" },
          imgPart,
        ],
      },
      { role: "user", content: "再截一张" },
    ];
    const result = stripExpiredImageParts(msgs);
    expect(result[2].content).toEqual([{ type: "text", text: "截图已保存" }]);
    expect(result[3]).toBe(msgs[3]);
  });

  it("纯文本消息不受影响", () => {
    const msgs = [
      { role: "user", content: "第一轮文本" },
      { role: "assistant", content: "回复第一轮" },
      { role: "user", content: "第二轮文本" },
    ];
    const result = stripExpiredImageParts(msgs);
    expect(result[0]).toBe(msgs[0]);
    expect(result[1]).toBe(msgs[1]);
    expect(result[2]).toBe(msgs[2]);
  });

  it("content 不是数组的消息不受影响", () => {
    const msgs = [
      { role: "user", content: "第一轮" },
      { role: "assistant", content: "回复" },
      { role: "user", content: "第二轮" },
    ];
    const result = stripExpiredImageParts(msgs);
    expect(result[0]).toBe(msgs[0]);
    expect(result[1]).toBe(msgs[1]);
    expect(result[2]).toBe(msgs[2]);
  });
});
