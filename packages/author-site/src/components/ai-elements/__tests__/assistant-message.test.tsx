import { fireEvent, render, screen } from "@testing-library/react";

import { AssistantMessage } from "@workbench/ai-chat-shared/assistant-message";
import { ToastProviderWrapper } from "@workbench/ai-chat-shared/ui/toast-provider";

describe("AssistantMessage", () => {
  it("gives an expanded image dialog an accessible title", () => {
    render(
      <ToastProviderWrapper>
        <AssistantMessage
          parts={[
            {
              type: "image",
              url: "https://example.com/mockup.png",
              alt: "登录页设计稿",
            },
          ]}
        />
      </ToastProviderWrapper>,
    );

    fireEvent.click(screen.getByRole("img", { name: "登录页设计稿" }));

    expect(
      screen.getByRole("dialog", { name: "图片预览：登录页设计稿" }),
    ).toBeInTheDocument();
  });
});
