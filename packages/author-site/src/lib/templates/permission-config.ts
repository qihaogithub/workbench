export const OPENCODE_CONFIG_TEMPLATE = {
  $schema: 'https://opencode.ai/config.json',
  permission: {
    edit: {
      '*': 'deny',
      'index.tsx': 'allow',
      'config.schema.json': 'allow',
      'project.config.schema.json': 'allow',
      '.demo.json': 'allow',
      'AGENTS.md': 'allow',
    },
    read: {
      '*': 'allow',
      '*.env': 'deny',
      '*.env.*': 'deny',
    },
    bash: {
      '*': 'ask',
      'ls *': 'allow',
      'cat *': 'allow',
      'grep *': 'allow',
      'rm *': 'deny',
      'mv *': 'deny',
      'cp *': 'deny',
      'mkdir *': 'deny',
    },
    external_directory: {},
  },
};

export const AGENTS_MD_TEMPLATE = `# UI Demo 工程师

## 当前工作目录
你正在编辑的项目工作空间包含多个 Demo 页面，位于 \`demos/\` 目录下。

## 核心约束
1. **你只能在工作空间目录内操作：**
   - 禁止访问上级目录或其他 package（如 \`packages/agent-service\`、\`packages/author-site\`、\`packages/shared\`）
   - 禁止访问 \`node_modules/\`、\`.git/\` 等目录

2. **你可以修改以下文件：**
   - \`demos/{demoId}/index.tsx\` — 页面 React 组件代码
   - \`demos/{demoId}/config.schema.json\` — 页面配置 Schema
   - \`demos/{demoId}/.demo.json\` — 页面元数据（name / order）
   - \`project.config.schema.json\` — 项目级共享配置定义（可选）
   - \`AGENTS.md\` — 本规则文件

3. **你可以读取但不能修改：**
   - 其他 Demo 目录下的文件（\`demos/*/\`）— 用于参考实现

4. **禁止操作：**
   - 禁止删除任何文件
   - 禁止运行 \`rm\`、\`mv\`、\`cp\`、\`mkdir\` 等命令
   - 禁止修改其他 Demo 的任何文件
   - 禁止询问用户"要修改哪个文件"，根据文件修改决策规则自主判断

## 文件修改决策规则
- 样式修改 → \`demos/{demoId}/index.tsx\`
- 配置项修改 → \`demos/{demoId}/config.schema.json\`
- 组件结构修改 → \`demos/{demoId}/index.tsx\`
- 项目级共享配置 → \`project.config.schema.json\`
- 页面元数据修改 → \`demos/{demoId}/.demo.json\`
- 创建新页面 → 在 \`demos/\` 下创建新目录

## 参考其他 Demo
如果需要参考其他 Demo 的实现，可以：
1. 使用 \`read\` 工具读取其他 Demo 的 \`index.tsx\`
2. 学习其实现后，在目标 Demo 的 \`index.tsx\` 中应用
3. **不要复制粘贴其他 Demo 的代码**，而是理解后重写
`;
