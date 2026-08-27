import { fireEvent, render, screen } from "@testing-library/react";

import { HtmlFileDropZone } from "./HtmlFileDropZone";

describe("HtmlFileDropZone", () => {
  it("仅接收 HTML 文件，并在拖入时显示上传提示", () => {
    const onFilesDrop = jest.fn();
    render(
      <HtmlFileDropZone onFilesDrop={onFilesDrop}>
        <div>预览内容</div>
      </HtmlFileDropZone>,
    );

    const zone = screen.getByText("预览内容").parentElement!;
    const html = new File(["<main>hello</main>"], "landing.html", {
      type: "text/html",
    });
    const text = new File(["notes"], "notes.txt", { type: "text/plain" });

    fireEvent.dragEnter(zone, { dataTransfer: { files: [html] } });
    expect(screen.getByText("释放以上传 HTML 文件")).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { files: [html, text] } });

    expect(onFilesDrop).toHaveBeenCalledWith([html]);
    expect(screen.queryByText("释放以上传 HTML 文件")).not.toBeInTheDocument();
  });
});
