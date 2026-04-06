# Demo Generator Agent 测试用例

## 测试环境
- 操作系统：Windows 11
- OpenCode 版本：最新版
- 项目：opencode-workbench

---

## 测试 1：配置文件格式验证

### 测试目标
验证 `opencode.json` 格式正确，可被 OpenCode 解析

### 测试步骤
1. 打开 `.opencode/opencode.json`
2. 验证 JSON 格式正确
3. 验证 `$schema` 字段正确
4. 验证 `agent`、`default_agent`、`instructions` 字段存在

### 预期结果
- ✅ JSON 格式正确，无语法错误
- ✅ 所有必需字段都存在
- ✅ 可以被 OpenCode 正确解析

---

## 测试 2：代理提示词内容验证

### 测试目标
验证 `demo-generator.md` 内容完整，覆盖所有必要规则

### 测试步骤
1. 打开 `.opencode/agents/demo-generator.md`
2. 检查是否包含以下内容：
   - 角色定义
   - 文件生成要求（index.tsx 和 config.schema.json）
   - 代码质量标准
   - 禁止行为清单
   - 工作流程说明
   - 代码示例
   - 输出格式要求
   - 自检清单

### 预期结果
- ✅ 所有必要内容都存在
- ✅ 规则描述清晰明确
- ✅ 代码示例完整可运行

---

## 测试 3：自动化脚本测试

### 测试目标
验证 `init-demo-agent.ps1` 脚本可正确执行

### 测试步骤
1. 创建新的测试目录
2. 运行脚本：`.\scripts\init-demo-agent.ps1 -TargetPath <测试目录>`
3. 检查生成的文件结构
4. 验证文件内容正确

### 预期结果
- ✅ 脚本执行成功，无错误
- ✅ 目录结构正确创建
- ✅ 文件内容正确
- ✅ 支持 `-Force` 参数覆盖
- ✅ 支持幂等操作（重复执行不报错）

---

## 测试 4：.gitignore 验证

### 测试目标
验证 `.opencode` 目录已加入 `.gitignore`

### 测试步骤
1. 打开 `.gitignore` 文件
2. 检查是否包含 `.opencode` 行

### 预期结果
- ✅ `.opencode` 已在 `.gitignore` 中
- ✅ 不会被提交到 Git 仓库

---

## 测试 5：边界情况测试

### 测试 5.1：目标路径不存在

**测试步骤**：
```powershell
.\scripts\init-demo-agent.ps1 -TargetPath "C:\nonexistent\path"
```

**预期结果**：
- ✅ 脚本报错，提示路径不存在
- ✅ 错误信息清晰

### 测试 5.2：目录已存在（不使用 -Force）

**测试步骤**：
1. 运行一次脚本
2. 再次运行（不加 `-Force`）

**预期结果**：
- ✅ 脚本提示目录已存在
- ✅ 不覆盖已有文件
- ✅ 正常退出（exit 0）

### 测试 5.3：目录已存在（使用 -Force）

**测试步骤**：
1. 运行一次脚本
2. 再次运行（加 `-Force`）

**预期结果**：
- ✅ 脚本提示将覆盖已有配置
- ✅ 成功覆盖并重新生成文件

---

## 测试 6：AI 生成质量测试（手动）

### 测试目标
验证 AI 代理能按照约束生成合格的 Demo 文件

### 测试步骤
1. 在 OpenCode 中打开项目
2. 请求 AI 生成一个简单的 Demo（如 "创建一个产品展示卡片"）
3. 检查生成的 `index.tsx`：
   - TypeScript 类型定义完整
   - 使用 Tailwind CSS
   - 无 `as any` 等不安全代码
   - 代码完整可运行
4. 检查生成的 `config.schema.json`：
   - JSON Schema 格式正确
   - 包含 title、properties、required
   - 每个属性有默认值
   - 与组件 Props 一一对应

### 预期结果
- ✅ AI 只生成两个文件
- ✅ 代码符合 TypeScript 严格模式
- ✅ Schema 符合 JSON Schema 规范
- ✅ 代码可直接运行
- ✅ Props 与 Schema 一致

---

## 测试报告

| 测试用例 | 状态 | 备注 |
|----------|------|------|
| 测试 1：配置文件格式验证 | ⏳ 待测试 | |
| 测试 2：代理提示词内容验证 | ⏳ 待测试 | |
| 测试 3：自动化脚本测试 | ✅ 已通过 | 脚本执行成功 |
| 测试 4：.gitignore 验证 | ⏳ 待测试 | |
| 测试 5.1：目标路径不存在 | ⏳ 待测试 | |
| 测试 5.2：目录已存在（无 -Force） | ⏳ 待测试 | |
| 测试 5.3：目录已存在（有 -Force） | ⏳ 待测试 | |
| 测试 6：AI 生成质量测试 | ⏳ 待测试 | 需手动测试 |
