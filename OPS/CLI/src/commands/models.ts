import chalk from "chalk";
import { request, createSpinner, showSuccess, showError, outputJson } from "../utils.js";

interface ModelInfo {
  id: string;
  label: string;
}

interface ModelsData {
  models: ModelInfo[];
  currentModelId?: string;
}

export async function listModels(
  baseUrl: string,
  jsonMode: boolean,
): Promise<void> {
  const spinner = createSpinner("正在获取模型列表...", jsonMode);

  try {
    const response = await request<ModelsData>(baseUrl, "/api/llm/models");
    spinner.stop();

    if (!response.success) {
      if (jsonMode) {
        outputJson({ success: false, error: response.error });
        return;
      }
      showError("获取模型列表失败", response.error);
      process.exit(1);
    }

    const { models, currentModelId } = response.data;

    if (jsonMode) {
      outputJson({ success: true, models, currentModelId });
      return;
    }

    console.log(chalk.cyan("\n=== 可用模型列表 ===\n"));

    if (models.length === 0) {
      console.log(chalk.gray("没有可用的模型"));
      console.log(chalk.gray("请检查 Pi Agent 模型供应商配置和 agent-service 日志"));
      console.log("");
      return;
    }

    for (const model of models) {
      const isCurrent = model.id === currentModelId;
      const prefix = isCurrent ? chalk.green("→ ") : "  ";
      const name = isCurrent
        ? chalk.green(`${model.label || model.id}`)
        : chalk.white(`${model.label || model.id}`);
      const id = chalk.gray(`(${model.id})`);
      console.log(`${prefix}${name} ${id}`);
    }

    if (currentModelId) {
      console.log(chalk.gray(`\n当前模型: ${currentModelId}`));
    }

    console.log(chalk.gray("\n提示: 使用 'ops-cli stream <sessionId> --model <model-id>' 切换模型"));
    console.log("");
  } catch (error) {
    spinner.stop();
    if (jsonMode) {
      outputJson({ success: false, error: error instanceof Error ? error.message : "未知错误" });
      return;
    }
    showError("请求失败");
    console.error(chalk.red(`\n错误详情: ${error instanceof Error ? error.message : "未知错误"}`));
    process.exit(1);
  }
}
