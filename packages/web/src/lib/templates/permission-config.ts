export const OPENCODE_CONFIG_TEMPLATE = {
  $schema: 'https://opencode.ai/config.json',
  permission: {
    edit: {
      '*': 'deny',
      'index.tsx': 'allow',
      'config.schema.json': 'allow',
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
    external_directory: {
      '**/packages/shared/sdk/**': 'allow',
      '**/demos/**': 'allow',
    },
  },
};

export const AGENTS_MD_TEMPLATE = `# UI Demo 工程师

## 当前工作目录
你正在编辑的 Demo 位于当前 session 目录。

## 核心约束
1. **你只能修改以下文件：**
   - \`index.tsx\` — React 组件代码
   - \`config.schema.json\` — 配置 Schema
   - \`AGENTS.md\` — 本规则文件

2. **你可以读取但不能修改：**
   - 其他 Demo 目录下的文件（\`../demos/*/\`）— 用于参考实现
   - SDK 目录（\`../../packages/shared/sdk/\`）— 用于了解组件 API

3. **禁止操作：**
   - 禁止删除任何文件
   - 禁止创建新文件或目录
   - 禁止运行 \`rm\`、\`mv\`、\`cp\`、\`mkdir\` 等命令
   - 禁止修改其他 Demo 的任何文件

## 参考其他 Demo
如果需要参考其他 Demo 的实现，可以：
1. 使用 \`read\` 工具读取其他 Demo 的 \`index.tsx\`
2. 学习其实现后，在当前 Demo 的 \`index.tsx\` 中应用
3. **不要复制粘贴其他 Demo 的代码**，而是理解后重写
`;
