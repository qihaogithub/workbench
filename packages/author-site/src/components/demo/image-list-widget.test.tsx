import { fireEvent, render, waitFor } from "@testing-library/react";
import { ImageListWidget } from "@workbench/demo-ui";

describe("ImageListWidget", () => {
  afterEach(() => {
    Reflect.deleteProperty(global, "fetch");
  });

  it("无 Session 时使用本地 Data URL 完成图片列表上传", async () => {
    const onChange = jest.fn();
    const fetchMock = jest.fn();
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    const { container } = render(
      <ImageListWidget value={[]} onChange={onChange} />,
    );
    const input = container.querySelector('input[type="file"]');
    const file = new File(["banner"], "banner.png", { type: "image/png" });

    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        {
          url: expect.stringMatching(/^data:image\/png;base64,/),
          alt: "banner.png",
        },
      ]);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("有 Session 时仍通过资产接口上传图片", async () => {
    const onChange = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { url: "/api/sessions/session-1/assets/banner.png" },
      }),
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    const { container } = render(
      <ImageListWidget
        value={[]}
        onChange={onChange}
        sessionId="session-1"
      />,
    );
    const input = container.querySelector('input[type="file"]');
    const file = new File(["banner"], "banner.png", { type: "image/png" });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/session-1/assets/upload",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onChange).toHaveBeenCalledWith([
        {
          url: "/api/sessions/session-1/assets/banner.png",
          alt: "banner.png",
        },
      ]);
    });
  });
});
