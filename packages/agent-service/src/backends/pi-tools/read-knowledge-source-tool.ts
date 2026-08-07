import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { KnowledgeServiceClient } from "@workbench/knowledge-service/client";
import type { AgentConfig } from "../../core/types";
import {
  isReferenceSourceRef,
  parseReferenceSourceRef,
  readReferencedProjectFile,
  resolveDataDir,
} from "./reference-resolver";

const ReadKnowledgeSourceParams = Type.Object({
  sourceRef: Type.String({
    description:
      "Opaque knowledge:// source reference returned by knowledgeReport",
  }),
});

type ReadKnowledgeSourceParams = Static<typeof ReadKnowledgeSourceParams>;

export function createReadKnowledgeSourceTool(
  config?: AgentConfig,
): AgentTool<typeof ReadKnowledgeSourceParams> {
  return {
    name: "readKnowledgeSource",
    label: "Read Knowledge Source",
    description:
      "Reads the exact indexed source behind a knowledge:// or ref:// reference. Use only references returned by knowledgeReport.",
    parameters: ReadKnowledgeSourceParams,
    execute: async (
      _toolCallId: string,
      args: ReadKnowledgeSourceParams,
    ) => {
      try {
        // 引用项目（ref://project/{projectId}/{path}）→ 受控 per-file 读取
        if (isReferenceSourceRef(args.sourceRef)) {
          const parsed = parseReferenceSourceRef(args.sourceRef);
          if (!parsed) {
            return {
              content: [{ type: "text", text: "Error: invalid reference sourceRef" }],
              details: { error: "INVALID_REFERENCE_SOURCE_REF" },
              isError: true,
            };
          }
          const allowed = config?.referencedProjects?.some(
            (r) => r.projectId === parsed.projectId,
          );
          if (!allowed && config?.referencedProjects) {
            return {
              content: [{ type: "text", text: "Error: referenced project not authorized in this session" }],
              details: { error: "REFERENCE_PROJECT_NOT_AUTHORIZED" },
              isError: true,
            };
          }
          const dataDir = resolveDataDir();
          const content = readReferencedProjectFile(
            dataDir,
            parsed.projectId,
            parsed.relativePath,
          );
          if (content === null) {
            return {
              content: [{ type: "text", text: "Error: referenced project file not found or not allowed" }],
              details: { error: "REFERENCE_SOURCE_NOT_FOUND" },
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text: [
                  `# ${parsed.relativePath}`,
                  "",
                  `引用项目：${parsed.projectId}`,
                  `来源路径：${parsed.relativePath}`,
                  "",
                  content,
                ].join("\n"),
              },
            ],
            details: {
              sourceRef: args.sourceRef,
              projectId: parsed.projectId,
              path: parsed.relativePath,
            },
          };
        }

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
