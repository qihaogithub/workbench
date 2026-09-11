import fs from "node:fs";
import path from "node:path";
import { buildEditSessionRequestBody } from "./session-bootstrap";

describe("buildEditSessionRequestBody", () => {
  it("重新进入编辑页时请求新建 AI 对话", () => {
    expect(buildEditSessionRequestBody("project-1")).toEqual({
      demoId: "project-1",
      forceNew: true,
    });
  });

  it("编辑页初始化使用新对话请求体", () => {
    const page = fs.readFileSync(path.join(__dirname, "page.tsx"), "utf-8");

    expect(page).toContain(
      "JSON.stringify(buildEditSessionRequestBody(demoId))",
    );
  });
});
