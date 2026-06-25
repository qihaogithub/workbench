import { render, screen } from "@testing-library/react";

import { Message } from "../message";

jest.mock(
  "streamdown",
  () => ({
    Streamdown: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="streamdown-renderer">{children}</div>
    ),
  }),
  { virtual: true },
);

jest.mock("@streamdown/code", () => ({ code: {} }), { virtual: true });
jest.mock("@streamdown/mermaid", () => ({ mermaid: {} }), { virtual: true });
jest.mock("@streamdown/math", () => ({ math: {} }), { virtual: true });
jest.mock("@streamdown/cjk", () => ({ cjk: {} }), { virtual: true });

describe("Message 用户消息展示", () => {
  it("普通 Markdown 用户消息使用 Markdown 渲染器展示", () => {
    const content = [
      "设计以下页面：",
      "| 页面/状态 | 内容和功能 |",
      "| --- | --- |",
      "| 站外引导页 | App WebView 内打开 |",
    ].join("\n");

    render(
      <Message
        message={{
          id: "user-1",
          role: "user",
          content,
        }}
      />,
    );

    expect(screen.getByTestId("user-message-markdown")).toBeInTheDocument();
    expect(screen.getByTestId("streamdown-renderer")).toHaveTextContent(
      "设计以下页面：",
    );
    expect(screen.getByTestId("streamdown-renderer")).toHaveTextContent(
      "站外引导页",
    );
  });
});
