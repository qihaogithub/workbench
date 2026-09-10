import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { previewObservationBroker } from "../../session/preview-observation-broker";
import {
  isPreviewObservationInput,
  type ObservePreviewInput,
  type PreviewObservationResult,
} from "@workbench/shared/demo/preview-observation";

const ObservePreviewParams = Type.Object({
  pageId: Type.Optional(Type.String({ maxLength: 128 })),
  target: Type.Optional(
    Type.Object(
      {
        nodeId: Type.Optional(Type.String({ maxLength: 128 })),
        sourceFile: Type.Optional(Type.String({ maxLength: 256 })),
        sourceLine: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 1_000_000 }),
        ),
        selectedElement: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false },
    ),
  ),
  detail: Type.Optional(
    Type.Union([
      Type.Literal("summary"),
      Type.Literal("layout"),
      Type.Literal("runtime"),
      Type.Literal("media"),
    ]),
  ),
  includeAncestors: Type.Optional(Type.Boolean()),
  assertions: Type.Optional(
    Type.Array(Type.Record(Type.String(), Type.Unknown()), { maxItems: 32 }),
  ),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
});

type ObservePreviewParamsType = Static<typeof ObservePreviewParams>;

function unavailableResult(reason: string): PreviewObservationResult {
  return {
    availability: "unavailable",
    readiness: "partial",
    capabilities: [],
    assertions: [],
    assertionStatus: "not-requested",
    evidence: { kind: "runtime-structure", precision: "layout" },
    reasons: [reason],
  };
}

export function createObservePreviewTool(
  config: AgentConfig,
): AgentTool<typeof ObservePreviewParams> {
  return {
    name: "observePreview",
    label: "Observe Active Preview",
    description:
      "Observe the active single-page preview in the originating browser connection. " +
      "Returns bounded runtime/layout facts and optional declarative assertion results. " +
      "It never executes arbitrary page JavaScript or selects another tab. Use this after a matching preview projection when technical self-verification is needed; no assertions means observed, not verified.",
    parameters: ObservePreviewParams,
    execute: async (
      _toolCallId: string,
      args: ObservePreviewParamsType,
      signal?: AbortSignal,
    ) => {
      const input = args as ObservePreviewInput;
      if (!isPreviewObservationInput(input)) {
        const result = unavailableResult("invalid-request");
        return {
          content: [
            {
              type: "text" as const,
              text: "observePreview 请求无效。仅支持受限 nodeId/sourceFile/selectedElement 与声明式断言。",
            },
          ],
          details: result,
        };
      }
      if (!config.connectionId) {
        const result = unavailableResult("no-originating-connection");
        return {
          content: [
            {
              type: "text" as const,
              text: "当前 Agent run 没有绑定浏览器连接，无法观察活动预览。",
            },
          ],
          details: result,
        };
      }
      const startedAt = Date.now();
      const result = await previewObservationBroker.observe(
        config.connectionId,
        input,
        input.timeoutMs,
        signal,
      );
      const serialized = JSON.stringify(result);
      const payloadBytes =
        typeof TextEncoder !== "undefined"
          ? new TextEncoder().encode(serialized).byteLength
          : serialized.length;
      return {
        content: [
          {
            type: "text" as const,
            text: `Preview observation:\n${serialized}`,
          },
        ],
        // Keep the model-facing content as the full E1 result while attaching
        // only bounded metrics to the structured details used by RunSummary.
        details: {
          ...(result as PreviewObservationResult),
          _observationMetrics: {
            latencyMs: Math.max(0, Date.now() - startedAt),
            payloadBytes: Math.min(payloadBytes, 64 * 1024),
          },
        },
      };
    },
  };
}
