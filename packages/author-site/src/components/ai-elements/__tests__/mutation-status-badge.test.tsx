import { render, screen } from "@testing-library/react";

import {
  MutationStatusBadge,
  computeMutationBadgeStatus,
  type MutationReceiptInfo,
  type ProjectionAckInfo,
} from "../mutation-status-badge";

describe("MutationStatusBadge", () => {
  describe("computeMutationBadgeStatus", () => {
    it("无 receipt 时应返回 preview-pending", () => {
      expect(computeMutationBadgeStatus(null, null)).toBe("preview-pending");
    });

    it("receipt.committed 为 true 且无 ack 时应返回 committed", () => {
      const receipt: MutationReceiptInfo = {
        mutationId: "m1",
        committed: true,
        revision: 1,
      };
      expect(computeMutationBadgeStatus(receipt, null)).toBe("committed");
    });

    it("receipt.committed 为 true 且 ack.status 为 applied 时应返回 preview-applied", () => {
      const receipt: MutationReceiptInfo = {
        mutationId: "m1",
        committed: true,
        revision: 1,
      };
      const ack: ProjectionAckInfo = {
        revision: 1,
        surface: "active-preview",
        status: "applied",
      };
      expect(computeMutationBadgeStatus(receipt, ack)).toBe("preview-applied");
    });

    it("receipt.committed 为 true 且 ack.status 为 failed 时应返回 preview-failed", () => {
      const receipt: MutationReceiptInfo = {
        mutationId: "m1",
        committed: true,
        revision: 1,
      };
      const ack: ProjectionAckInfo = {
        revision: 1,
        surface: "active-preview",
        status: "failed",
      };
      expect(computeMutationBadgeStatus(receipt, ack)).toBe("preview-failed");
    });

    it("receipt.committed 为 false 时应返回 preview-pending", () => {
      const receipt: MutationReceiptInfo = {
        mutationId: "m1",
        committed: false,
        revision: 1,
      };
      expect(computeMutationBadgeStatus(receipt, null)).toBe("preview-pending");
    });
  });

  describe("渲染", () => {
    it("应渲染 '修改已提交' 当 receipt 存在且 committed 为 true", () => {
      render(
        <MutationStatusBadge
          receipt={{ mutationId: "m1", committed: true, revision: 1 }}
          ack={null}
        />,
      );
      const badge = screen.getByTestId("mutation-status-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("修改已提交");
      expect(badge).toHaveAttribute("data-status", "committed");
    });

    it("应渲染 '预览更新中' 当 receipt 和 ack 都不存在", () => {
      render(<MutationStatusBadge receipt={null} ack={null} />);
      const badge = screen.getByTestId("mutation-status-badge");
      expect(badge).toHaveTextContent("预览更新中");
      expect(badge).toHaveAttribute("data-status", "preview-pending");
    });

    it("应渲染 '预览已应用' 当 ack.status 为 applied", () => {
      render(
        <MutationStatusBadge
          receipt={{ mutationId: "m1", committed: true, revision: 1 }}
          ack={{ revision: 1, surface: "active-preview", status: "applied" }}
        />,
      );
      const badge = screen.getByTestId("mutation-status-badge");
      expect(badge).toHaveTextContent("预览已应用");
      expect(badge).toHaveAttribute("data-status", "preview-applied");
    });

    it("应渲染 '预览失败' 当 ack.status 为 failed", () => {
      render(
        <MutationStatusBadge
          receipt={{ mutationId: "m1", committed: true, revision: 1 }}
          ack={{ revision: 1, surface: "active-preview", status: "failed" }}
        />,
      );
      const badge = screen.getByTestId("mutation-status-badge");
      expect(badge).toHaveTextContent("预览失败");
      expect(badge).toHaveAttribute("data-status", "preview-failed");
    });

    it("预览更新中时图标应有 animate-spin 类", () => {
      const { container } = render(
        <MutationStatusBadge receipt={null} ack={null} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg?.classList.toString()).toContain("animate-spin");
    });
  });
});
