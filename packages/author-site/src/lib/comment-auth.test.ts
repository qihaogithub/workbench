import type { CommentAuthorResult } from "./comment-auth";
import { canEditOrDeleteComment } from "./comment-auth";

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(),
  verifyToken: jest.fn(),
}));
jest.mock("@/lib/user", () => ({ findUserById: jest.fn() }));

function operator(id: string, userId?: string, role: "admin" | "editor" = "editor"): CommentAuthorResult {
  return {
    author: { id, name: id, isAnonymous: !userId },
    userId,
    role: userId ? role : undefined,
  };
}

describe("canEditOrDeleteComment", () => {
  it("仅允许登录用户编辑或删除自己的评论", () => {
    expect(canEditOrDeleteComment(operator("user-1", "user-1"), "user-1")).toBe(true);
    expect(canEditOrDeleteComment(operator("user-2", "user-2"), "user-1")).toBe(false);
  });

  it("匿名用户只能操作同一 anonymousId 创建的评论", () => {
    expect(canEditOrDeleteComment(operator("anon-1"), "anon-1")).toBe(true);
    expect(canEditOrDeleteComment(operator("anon-2"), "anon-1")).toBe(false);
  });

  it("管理员也不能越权修改其他发送者的正文或删除其回复", () => {
    expect(canEditOrDeleteComment(operator("admin-1", "admin-1", "admin"), "user-1")).toBe(false);
  });

  it("拒绝空作者标识，避免 malformed 记录通过相等判断", () => {
    expect(canEditOrDeleteComment(operator(""), "")).toBe(false);
  });
});
