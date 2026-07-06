export interface CliPromptOptions {
  authorSiteUrl?: string;
  commandName?: string;
  dataDirPlaceholder?: string;
  cliVersion?: string;
}

export function createProjectCliUsagePrompt(options: CliPromptOptions = {}): string {
  const authorSiteUrl = options.authorSiteUrl ?? "http://localhost:3200";
  const commandName = options.commandName ?? "ow";
  const cliVersion = options.cliVersion ?? "0.1.0";
  const dataDir = options.dataDirPlaceholder ?? "<absolute-path-to-workbench-data>";

  return [
    "请使用 workbench 的 Project Admin CLI 管理创作端项目。",
    "",
    `项目地址：${authorSiteUrl}`,
    `CLI 版本：${cliVersion}`,
    `命令：${commandName}`,
    `数据目录：${dataDir}`,
    "",
    "使用要求：",
    `1. 先运行 ${commandName} doctor --json 确认 CLI、DATA_DIR 和操作者信息。`,
    `2. 本地开发先运行 ${commandName} project pull <projectId> <dir> --json，再进入本地项目包目录。`,
    `3. 本地改动后运行 ${commandName} validate --json、${commandName} diff --json 和 ${commandName} submit --json。`,
    `4. 直接管理线上事务时，必须先 ${commandName} edit begin <projectId> --json 打开编辑事务。`,
    `5. 事务提交前必须运行 ${commandName} edit validate <editId> --json 和 ${commandName} edit diff <editId> --json。`,
    "6. 删除、发布、回滚和批量操作必须使用 preview/confirm token 或显式用户确认。",
    "6. 不要直接修改 data/、project.json、workspace-tree.json、.session.json 或生成物。",
    "",
    "完成自检后告诉我：CLI 是否可用、当前账号有哪些项目权限、下一步建议是什么。",
  ].join("\n");
}

export function createProjectCliQuickReference(options: CliPromptOptions = {}): string {
  const commandName = options.commandName ?? "ow";
  return [
    `${commandName} doctor --json`,
    `${commandName} project list --json`,
    `${commandName} project pull <projectId> <dir> --json`,
    `${commandName} validate --json`,
    `${commandName} diff --json`,
    `${commandName} submit --json`,
    `${commandName} template list --json`,
    `${commandName} edit begin <projectId> --json`,
    `${commandName} page list <editId> --json`,
    `${commandName} edit validate <editId> --json`,
    `${commandName} edit diff <editId> --json`,
    `${commandName} edit commit <editId> --note "..." --json`,
    `${commandName} publish check <projectId> --json`,
    `${commandName} publish project <projectId> --json`,
  ].join("\n");
}
