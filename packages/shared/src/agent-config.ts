/**
 * AI 后端供应商配置类型
 *
 * 用于在管理后台动态配置自定义 LLM 供应商（不限于 pi-ai 内置 KnownProvider）。
 * 每个供应商定义自己的 baseURL、apiKey 和可用模型列表。
 *
 * 存储位置：author-site 的 system_configs.model_config.backendProviders 字段
 * 加载方式：agent-service 启动时从 DB 读取，运行时可通过 HTTP 端点动态更新
 */

/**
 * 单个 AI 后端供应商配置
 */
export interface BackendProvider {
  /** 供应商唯一标识（用作模型 ID 前缀，如 "jojo" → "jojo/deepseek-v4-flash"）*/
  id: string;
  /** 展示名（用于管理后台 UI）*/
  name: string;
  /** OpenAI 兼容格式的 API 基础地址 */
  baseURL: string;
  /** API Key（管理后台写入 DB，运行时仅服务端读取）*/
  apiKey: string;
  /** 该供应商下可用的模型 ID 列表 */
  models: string[];
  /** 选填：默认选中的模型 ID（不填则取 models[0]）*/
  defaultModel?: string;
  /** 选填：是否启用，默认 true */
  enabled?: boolean;
}

/**
 * 后端供应商配置集合
 */
export interface BackendProvidersConfig {
  /** 供应商列表 */
  providers: BackendProvider[];
  /** 当前激活的供应商 ID（用于确定 defaultModelId）*/
  activeProviderId?: string;
  /** 当前激活的模型 ID（格式：providerId/modelId）*/
  activeModelId?: string;
}

/**
 * 单个可用模型信息（统一格式）
 */
export interface AvailableModelInfo {
  id: string;
  label: string;
  group: string;
}
