import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export const CapabilityName = Type.Union([
  Type.Literal("workspace"),
  Type.Literal("pages"),
  Type.Literal("comments"),
  Type.Literal("image"),
  Type.Literal("web"),
  Type.Literal("external"),
  Type.Literal("all"),
]);

const ActivateCapabilitiesParams = Type.Object({
  capabilities: Type.Array(CapabilityName, {
    minItems: 1,
    uniqueItems: true,
    description: "Capabilities required for the current task. Use all only when the task genuinely spans several areas.",
  }),
  reason: Type.String({ minLength: 1, description: "Brief task-specific reason for loading these capabilities." }),
});

export type CapabilityName = Static<typeof CapabilityName>;
type ActivateCapabilitiesParams = Static<typeof ActivateCapabilitiesParams>;

export type CapabilityActivationHandler = (
  capabilities: CapabilityName[],
) => Promise<string[]>;

/**
 * 这是上下文加载开关，不是权限确认：服务端在同一 Harness 内激活已注册工具。
 * Agent 不需要用户确认，也不能借此获得服务端本来没有注册的能力。
 */
export function createActivateCapabilitiesTool(
  handler?: CapabilityActivationHandler,
): AgentTool<typeof ActivateCapabilitiesParams> {
  return {
    name: "activateCapabilities",
    label: "Load Task Capabilities",
    description: "Load the tools needed for the current task. This is automatic and does not ask the user for permission. Call it before using a capability that is not currently listed.",
    parameters: ActivateCapabilitiesParams,
    execute: async (_toolCallId, args) => {
      if (!handler) {
        return {
          content: [{ type: "text" as const, text: "Capability loading is unavailable; continue with the currently active tools." }],
          details: { capabilities: args.capabilities, unavailable: true },
          isError: true,
        };
      }
      const toolNames = await handler(args.capabilities);
      return {
        content: [{ type: "text" as const, text: `Loaded capabilities for this session: ${toolNames.join(", ") || "none"}. Continue the current task with the newly active tools.` }],
        details: { capabilities: args.capabilities, reason: args.reason, toolNames },
      };
    },
  };
}
