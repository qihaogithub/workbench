import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { KnowledgeServiceClient } from "@workbench/knowledge-service/client";

const ReadKnowledgeSourceParams = Type.Object({
  sourceRef: Type.String({
    description:
      "Opaque knowledge:// source reference returned by knowledgeReport",
  }),
});

type ReadKnowledgeSourceParams = Static<typeof ReadKnowledgeSourceParams>;

export function createReadKnowledgeSourceTool(): AgentTool<
  typeof ReadKnowledgeSourceParams
> {
  return {
    name: "readKnowledgeSource",
    label: "Read Knowledge Source",
    description:
      "Reads the exact indexed source behind a knowledge:// reference. Use only references returned by knowledgeReport.",
    parameters: ReadKnowledgeSourceParams,
    execute: async (
      _toolCallId: string,
      args: ReadKnowledgeSourceParams,
    ) => {
      try {
        const source = await new KnowledgeServiceClient().read(args.sourceRef);
        if (!source) {
          return {
            content: [{ type: "text", text: "Error: knowledge source not found" }],
            details: { error: "KNOWLEDGE_SOURCE_NOT_FOUND" },
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: [
                `# ${source.title}`,
                "",
                `模板项目：${source.projectName}`,
                `来源路径：${source.path}`,
                `修订：${source.revision}`,
                `根哈希：${source.rootHash}`,
                "",
                source.content,
              ].join("\n"),
            },
          ],
          details: {
            sourceRef: source.sourceRef,
            projectId: source.projectId,
            documentId: source.documentId,
            revision: source.revision,
            rootHash: source.rootHash,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          details: { error: "KNOWLEDGE_SERVICE_UNAVAILABLE" },
          isError: true,
        };
      }
    },
  };
}
