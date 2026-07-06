import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExternalAuthRequiredDetails } from "@workbench/shared/contracts";
import type { AgentConfig } from "../../core/types";
import type { PermissionHandler } from "./delete-page-tool";

const WRITE_PATTERN = /(create|update|delete|upload|import|write|set|add|send|commit)/i;

const FigmaMcpParams = Type.Object({
  action: Type.Union([Type.Literal("listTools"), Type.Literal("callTool")]),
  toolName: Type.Optional(Type.String()),
  args: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
type FigmaMcpParams = Static<typeof FigmaMcpParams>;

function createAuthRequiredDetails(
  reason: ExternalAuthRequiredDetails["reason"],
): ExternalAuthRequiredDetails {
  return {
    kind: "external_auth_required",
    provider: "figma",
    reason,
    title: reason === "expired" ? "Figma 授权已过期" : "连接 Figma 后继续",
    message:
      reason === "expired"
        ? "需要重新授权 Figma，AI 才能继续读取或写入你的设计稿。"
        : "需要使用你的 Figma 权限授权，AI 才能读取或写入你有权限访问的设计稿。",
  };
}

async function callFigmaMcp(
  accessToken: string,
  body: unknown,
): Promise<unknown> {
  const endpoint = process.env.FIGMA_MCP_URL || "https://mcp.figma.com/mcp";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(process.env.FIGMA_MCP_REGION
        ? { "X-Figma-Region": process.env.FIGMA_MCP_REGION }
        : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }
  if (!res.ok) {
    throw new Error(`Figma MCP request failed: ${res.status} ${text}`);
  }
  return parsed;
}

export function createFigmaMcpTool(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
): AgentTool<typeof FigmaMcpParams> {
  return {
    name: "figmaMcp",
    label: "Figma MCP",
    description:
      "Use the current user's Figma authorization with the official Figma MCP endpoint. If the deployment has no Figma MCP access, report the platform error.",
    parameters: FigmaMcpParams,
    execute: async (toolCallId: string, args: FigmaMcpParams) => {
      const figma = config.externalAuth?.figma;
      if (!figma?.enabled || !figma.accessToken) {
        const details = createAuthRequiredDetails("not_connected");
        return {
          content: [{ type: "text", text: details.message }],
          details,
          isError: true,
        };
      }

      if (figma.expiresAt && figma.expiresAt <= Date.now()) {
        const details = createAuthRequiredDetails("expired");
        return {
          content: [{ type: "text", text: details.message }],
          details,
          isError: true,
        };
      }

      if (args.action === "callTool") {
        if (!args.toolName) {
          return {
            content: [{ type: "text", text: "Error: toolName is required for callTool." }],
            details: { error: "toolName required" },
            isError: true,
          };
        }
        if (WRITE_PATTERN.test(args.toolName)) {
          const approved = await permissionHandler?.(toolCallId, {
            title: "确认执行 Figma 写操作",
            summary: `Figma MCP tool: ${args.toolName}`,
          });
          if (!approved) {
            return {
              content: [{ type: "text", text: "用户已取消 Figma 写操作。" }],
              details: { cancelled: true },
              isError: true,
            };
          }
        }
      }

      const body =
        args.action === "listTools"
          ? { jsonrpc: "2.0", id: toolCallId, method: "tools/list", params: {} }
          : {
              jsonrpc: "2.0",
              id: toolCallId,
              method: "tools/call",
              params: {
                name: args.toolName,
                arguments: args.args || {},
              },
            };

      try {
        const result = await callFigmaMcp(figma.accessToken, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: {
            action: args.action,
            toolName: args.toolName,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Figma MCP error";
        return {
          content: [{
            type: "text",
            text: `Figma MCP 不可用或当前部署未获准入：${message}`,
          }],
          details: { action: args.action, toolName: args.toolName, error: message },
          isError: true,
        };
      }
    },
  };
}
