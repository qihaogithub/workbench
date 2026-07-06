import {
  createOpenPencilSaveFailureError,
  getOpenPencilSaveFailureMessage,
  isOpenPencilSaveFailureError,
} from "./openpencil-save-error";

describe("getOpenPencilSaveFailureMessage", () => {
  it("将 409 patch 冲突转换为用户可理解的保存提示", () => {
    expect(
      getOpenPencilSaveFailureMessage({
        status: 409,
        message: "草图 patch 基线已过期，请重新加载后再保存",
      }),
    ).toBe("手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存。");
  });

  it("非冲突错误保留服务端可读文案", () => {
    expect(
      getOpenPencilSaveFailureMessage({
        status: 400,
        message: "草图 scene 无法解析，暂不应用 patch",
      }),
    ).toBe("草图 scene 无法解析，暂不应用 patch");
  });

  it("409 错误对象标记为可通过加载最新内容恢复", () => {
    const error = createOpenPencilSaveFailureError({
      status: 409,
      message: "草图 patch 基线已过期，请重新加载后再保存",
    });

    expect(isOpenPencilSaveFailureError(error)).toBe(true);
    expect(error.recoverableByReload).toBe(true);
    expect(error.message).toBe("手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存。");
  });
});
