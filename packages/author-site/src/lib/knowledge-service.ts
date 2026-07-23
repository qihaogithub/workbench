import { KnowledgeServiceClient } from "@workbench/knowledge-service/client";

const client = new KnowledgeServiceClient();

export async function reconcileTemplateKnowledge(): Promise<void> {
  try {
    await client.reconcile();
  } catch (error) {
    console.warn("Knowledge service reconcile failed:", error);
  }
}
