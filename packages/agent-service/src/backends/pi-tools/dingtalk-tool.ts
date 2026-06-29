import { execFile } from "child_process";
import { promisify } from "util";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExternalAuthRequiredDetails } from "@opencode-workbench/shared/contracts";
import type { AgentConfig } from "../../core/types";
import type { PermissionHandler } from "./delete-page-tool";

const execFileAsync = promisify(execFile);
const ALLOWED_PRODUCTS = new Set(["doc", "sheet", "wiki"]);
const WRITE_COMMANDS = new Set([
  "add",
  "append",
  "block",
  "copy",
  "create",
  "csv-put",
  "delete",
  "delete-dimension",
  "delete-dropdown",
  "delete-float-image",
  "delete-sheet",
  "export",
  "insert",
  "insert-dimension",
  "media",
  "member",
  "merge-cells",
  "move",
  "permission",
  "rename",
  "replace",
  "set-dropdown",
  "unmerge-cells",
  "update",
  "update-dimension",
  "update-float-image",
  "upload",
  "write-image",
]);

const DingtalkParams = Type.Object({
  product: Type.Union([
    Type.Literal("doc"),
    Type.Literal("sheet"),
    Type.Literal("wiki"),
  ]),
  command: Type.Array(Type.String(), {
    minItems: 1,
    description: "dws subcommand arguments after the product name. Do not include dws, product, --format, or shell syntax.",
  }),
});
type DingtalkParams = Static<typeof DingtalkParams>;

function sanitizeArgs(args: string[]): string[] | null {
  if (args.some((arg) => /[|;&<>`$]/.test(arg))) return null;
  return args.filter((arg) => arg !== "--format" && arg !== "-f");
}

function isWriteCommand(args: string[]): boolean {
  return args.some((arg) => WRITE_COMMANDS.has(arg));
}

function createAuthRequiredDetails(): ExternalAuthRequiredDetails {
  return {
    kind: "external_auth_required",
    provider: "dingtalk",
    reason: "not_connected",
    title: "连接钉钉后继续",
    message:
      "需要使用你的钉钉权限授权，AI 才能读取或写入你有权限访问的钉钉文档、表格和知识库。",
  };
}

function createReauthRequiredDetails(): ExternalAuthRequiredDetails {
  return {
    kind: "external_auth_required",
    provider: "dingtalk",
    reason: "needs_reauth",
    title: "重新连接钉钉后继续",
    message:
      "当前钉钉登录态已失效，需要重新授权后，AI 才能继续读取或写入你有权限访问的钉钉文档、表格和知识库。",
  };
}

function getExecErrorText(error: unknown): string {
  if (error instanceof Error) {
    const output = error as Error & { stdout?: unknown; stderr?: unknown };
    return [error.message, output.stdout, output.stderr]
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .join("\n");
  }
  return "Unknown dws error";
}

function isAuthFailure(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("未登录") ||
    text.includes("登录") ||
    text.includes("unauthorized") ||
    text.includes("401") ||
    text.includes("authentication") ||
    text.includes("auth required")
  );
}

export function createDingtalkTool(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
): AgentTool<typeof DingtalkParams> {
  return {
    name: "dingtalk",
    label: "DingTalk",
    description:
      "Use the current user's DingTalk authorization through dws. Only doc, sheet, and wiki are allowed. Write operations require user confirmation.",
    parameters: DingtalkParams,
    execute: async (toolCallId: string, args: DingtalkParams) => {
      if (!ALLOWED_PRODUCTS.has(args.product)) {
        return {
          content: [{ type: "text", text: "Error: only dws doc, sheet, and wiki are allowed." }],
          details: { error: "product denied" },
          isError: true,
        };
      }

      const dingtalk = config.externalAuth?.dingtalk;
      if (!dingtalk?.enabled || !dingtalk.configDir) {
        const details = createAuthRequiredDetails();
        return {
          content: [{ type: "text", text: details.message }],
          details,
          isError: true,
        };
      }

      const command = sanitizeArgs(args.command);
      if (!command) {
        return {
          content: [{ type: "text", text: "Error: shell syntax is not allowed in dingtalk command arguments." }],
          details: { error: "unsafe arguments" },
          isError: true,
        };
      }

      const writeCommand = isWriteCommand(command);
      if (writeCommand) {
        const approved = await permissionHandler?.(toolCallId, {
          title: "确认执行钉钉写操作",
          summary: `dws ${args.product} ${command.join(" ")}`,
        });
        if (!approved) {
          return {
            content: [{ type: "text", text: "用户已取消钉钉写操作。" }],
            details: { cancelled: true },
            isError: true,
          };
        }
      }

      const finalArgs = [
        args.product,
        ...command,
        "--format",
        "json",
        ...(writeCommand ? ["--yes"] : []),
      ];
      try {
        const { stdout, stderr } = await execFileAsync("dws", finalArgs, {
          env: {
            ...process.env,
            DWS_CONFIG_DIR: dingtalk.configDir,
          },
          timeout: 60_000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const output = stdout || stderr || "{}";
        return {
          content: [{ type: "text", text: output }],
          details: {
            product: args.product,
            command,
            outputLength: output.length,
          },
        };
      } catch (error) {
        const message = getExecErrorText(error);
        if (isAuthFailure(message)) {
          const details = createReauthRequiredDetails();
          return {
            content: [{ type: "text", text: details.message }],
            details,
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `钉钉 dws 执行失败：${message}` }],
          details: { product: args.product, command, error: message },
          isError: true,
        };
      }
    },
  };
}
