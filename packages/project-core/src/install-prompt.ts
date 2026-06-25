export interface InstallPromptOptions {
  authorSiteUrl?: string;
  mode?: "stdio" | "remote";
  serverCommand?: string;
  remoteUrl?: string;
  skillName?: string;
  mcpVersion?: string;
}

export function createCodexInstallPrompt(options: InstallPromptOptions = {}): string {
  const mode = options.mode ?? "stdio";
  const skillName = options.skillName ?? "opencode-project-admin";
  const authorSiteUrl = options.authorSiteUrl ?? "http://localhost:3200";
  const mcpVersion = options.mcpVersion ?? "0.1.0";
  const serverConfig =
    mode === "stdio"
      ? `本地 stdio 命令：${options.serverCommand ?? "pnpm --filter @opencode-workbench/project-admin-mcp start"}`
      : `远程 MCP 地址：${options.remoteUrl ?? "https://<your-author-site>/mcp"}`;

  return [
    "请帮我在当前 Codex 环境安装并启用 opencode-workbench 的 Project Admin MCP 和配套技能。",
    "",
    `项目地址：${authorSiteUrl}`,
    `MCP 版本：${mcpVersion}`,
    `MCP 模式：${mode}`,
    `MCP 服务配置：${serverConfig}`,
    `技能名称：${skillName}`,
    "",
    "安装要求：",
    "1. 安装 MCP 后，先运行只读自检，不要执行写操作。",
    "2. 自检需要确认可以读取当前用户权限、项目列表和模板列表。",
    "3. 后续维护项目时必须通过 MCP 工具，不要直接修改 data/、project.json、workspace-tree.json。",
    "4. 删除、发布、回滚和批量操作必须先 dryRun 或生成预览计划。",
    "5. 如果需要 token，请提示我手动填写；不要假设提示词里包含真实密钥。",
    "",
    "请完成安装检查后告诉我：MCP 是否可用、技能是否可用、当前账号有哪些项目权限。",
  ].join("\n");
}

export function createMcpClientConfigSnippet(options: InstallPromptOptions = {}): string {
  const mode = options.mode ?? "stdio";
  if (mode === "remote") {
    return JSON.stringify(
      {
        mcpServers: {
          "opencode-project-admin": {
            type: "http",
            url: options.remoteUrl ?? "https://<your-author-site>/mcp",
            headers: {
              Authorization: "Bearer <PROJECT_ADMIN_TOKEN>",
            },
          },
        },
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      mcpServers: {
        "opencode-project-admin": {
          command: "pnpm",
          args: ["--filter", "@opencode-workbench/project-admin-mcp", "start"],
          env: {
            DATA_DIR: "<absolute-path-to-opencode-workbench-data>",
            PROJECT_ADMIN_TOKEN: "<optional-local-token>",
          },
        },
      },
    },
    null,
    2,
  );
}
