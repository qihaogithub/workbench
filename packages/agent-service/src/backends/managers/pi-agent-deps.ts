/**
 * Pi Agent 动态依赖加载器
 *
 * 集中管理 @earendil-works/pi-agent-core 和 @earendil-works/pi-ai 的动态导入，
 * 供各管理器共享，避免多处重复加载。
 */

let AgentHarness: any;
let NodeExecutionEnv: any;
let InMemorySessionRepo: any;
let getModel: any;
let getModels: any;

export async function loadPiAgentDeps(): Promise<void> {
  if (!AgentHarness) {
    const piAgentCore = await import('@earendil-works/pi-agent-core');
    AgentHarness = piAgentCore.AgentHarness;
    InMemorySessionRepo = piAgentCore.InMemorySessionRepo;

    const piAgentCoreNode = await import('@earendil-works/pi-agent-core/node');
    NodeExecutionEnv = piAgentCoreNode.NodeExecutionEnv;

    const piAi = await import('@earendil-works/pi-ai');
    getModel = piAi.getModel;
    getModels = piAi.getModels;
  }
}

export function getAgentHarness(): any {
  return AgentHarness;
}

export function getNodeExecutionEnv(): any {
  return NodeExecutionEnv;
}

export function getInMemorySessionRepo(): any {
  return InMemorySessionRepo;
}

export function getGetModel(): any {
  return getModel;
}

export function getGetModels(): any {
  return getModels;
}
