# Demo 生成系统 - 开发方案文档

## 一、背景

### 1.1 业务背景

OpenCode Workbench 是一个"所见即所得"的可配置 Demo 生成系统，服务于三类用户：
- **UI 设计师**：Demo 生产者，通过 AI 生成高还原度 Demo
- **运营设计师**：Demo 使用者，在 Web 端配置参数并实时预览
- **研发/管理员**：系统维护者，维护 SDK 组件库和 Demo 库

### 1.2 核心痛点

1. **AI 生成质量不可控**：AI 生成的 Demo 文件格式不统一、质量参差丕齐
2. **缺乏标准化约束**：没有统一的规则约束 AI 按照系统标准生成可用的 Demo 文件
3. **用户体验不一致**：不同 AI 代理生成的代码风格、结构差异大

### 1.3 技术方案

采用 OpenCode 官方的 `.opencode/agents/` 机制：
- 在 **Session 临时工作区**中自动注入 `.opencode` 目录
- 配置专用的 `demo-generator` 代理作为默认代理
- 通过代理提示词约束 AI 行为，确保生成标准化的 `index.tsx` 和 `config.schema.json`

---

## 二、目标

### 2.1 业务目标

✅ 确保 AI 生成的 Demo 文件 100% 符合系统标准  
✅ 降低 AI 生成质量的不可控性  
✅ 提升 Demo 生成的成功率和可用性  

### 2.2 技术目标

1. **标准化输出**：AI 只生成 `index.tsx` 和 `config.schema.json` 两个文件
2. **格式统一**：代码风格、组件结构、Schema 定义遵循统一规范
3. **质量保证**：生成的代码可直接运行，无需额外修改
4. **权限控制**：限制 AI 代理只能写入/编辑文件，不能执行命令
5. **会话隔离**：`.opencode` 配置属于 Session，不影响原始 Demo

### 2.3 用户体验目标

- 自动注入：创建 Session 时自动生成 `.opencode` 配置
- 自动生效：OpenCode 启动时自动加载代理配置
- 会话清理：保存或删除 Session 时自动清理 `.opencode`

---

## 三、方案

### 3.1 整体架构

**重要**：`.opencode` 目录属于 **Session 临时工作区**，而非项目源码目录。

```
sessions/
└── session-{timestamp}-{random}/
    ├── index.tsx              # 组件代码副本
    ├── config.schema.json     # 配置定义副本
    ├── .session.json          # 会话元数据
    └── .opencode/             # ← OpenCode 代理配置（临时工作区专属）
        ├── opencode.json      # OpenCode 项目配置
        └── agents/
            └── demo-generator.md  # Demo 生成代理提示词
```

### 3.2 注入时机

**.opencode 配置在创建 Session 时自动注入**：

```
用户点击"编辑 Demo"
      │
      ▼
创建 Session（复制 Demo 到 sessions/）
      │
      ▼
自动注入 .opencode 配置
      │
      ▼
用户在 OpenCode 中打开 Session
      │
      ▼
demo-generator 代理自动生效
```

### 3.3 实现方式

**TypeScript 代码注入**（`session-manager.ts`）：
- 在 `createEditSession()` 函数中调用 `injectOpencodeAgentConfig()`
- 自动创建 `.opencode` 目录和配置文件
- 无需外部脚本，集成到系统核心流程中

**PowerShell 脚本**（可选工具）：
- `scripts/init-demo-agent.ps1` - 手动注入工具（用于调试）

### 3.4 代理配置

**`opencode.json`** 核心配置：
```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "demo-generator": {
      "file": ".opencode/agents/demo-generator.md",
      "description": "专门用于生成 OpenCode Demo 文件的 AI 代理",
      "tools": {
        "write": true,
        "edit": true,
        "bash": false,
        "fetch": false
      }
    }
  },
  "default_agent": "demo-generator",
  "instructions": [".opencode/agents/demo-generator.md"]
}
```

### 3.5 代理提示词设计

**`demo-generator.md`** 包含以下内容：

1. **角色定义**：Demo 生成专家
2. **核心规则**：
   - 只操作 `index.tsx` 和 `config.schema.json`
   - 使用 TypeScript + Tailwind CSS + shadcn/ui
   - 遵循代码质量标准
3. **禁止行为**：
   - 禁止修改系统文件（.session.json 等）
   - 禁止生成额外文件
   - 禁止使用 `as any` 等不安全代码
4. **工作流程**：理解需求 → 设计 Schema → 实现组件 → 验证输出

---

## 四、开发任务

### 任务 1：实现 Session 注入逻辑 ✅

**负责人**：AI  
**状态**：已完成  

**交付物**：
- `packages/web/src/lib/session-manager.ts` - 添加 `injectOpencodeAgentConfig()` 函数
- 在 `createEditSession()` 中调用注入函数

**验收标准**：
- [x] 注入函数实现正确
- [x] 在创建 Session 时自动调用
- [x] TypeScript 类型检查通过
- [x] 不影响现有 Session 功能

---

### 任务 2：创建调试脚本 🚧

**负责人**：AI  
**状态**：进行中  

**详细需求**：
1. 创建 PowerShell 脚本 `init-demo-agent.ps1`
   - 接受 `-SessionPath` 参数
   - 检查 Session 路径有效性
   - 注入 `.opencode` 配置
   - 验证配置文件格式

2. 用于手动调试和测试

**验收标准**：
- [ ] 脚本可重复执行
- [ ] 错误处理完善
- [ ] 有清晰的执行日志
- [ ] 支持幂等操作

---

### 任务 3：测试验证 📋

**负责人**：待分配  
**状态**：未开始  

**详细需求**：
1. 功能测试
   - 创建 Session 时检查 `.opencode` 是否自动创建
   - 验证配置文件格式正确
   - 测试 OpenCode 是否能正确加载代理

2. 边界测试
   - 测试 Session 保存后 `.opencode` 是否被清理
   - 测试 Session 删除时 `.opencode` 是否被清理
   - 测试并发 Session 的隔离性

3. 集成测试
   - 在 OpenCode 中打开 Session
   - 验证 `demo-generator` 代理是否生效
   - 测试 AI 生成文件是否符合约束

**验收标准**：
- [ ] 自动注入功能正常
- [ ] 清理逻辑正确
- [ ] AI 生成的代码符合规范
- [ ] 所有测试用例通过

---

### 任务 4：文档完善 📋

**负责人**：待分配  
**状态**：未开始  

**详细需求**：
1. 更新架构文档
   - 在会话管理文档中添加 `.opencode` 说明
   - 说明注入时机和生命周期

2. 编写使用指南
   - 如何调试 AI 生成问题
   - 自定义代理提示词（高级）
   - 常见问题 FAQ

3. 更新开发者文档
   - 注入机制实现说明
   - 代理配置规范
   - 最佳实践

**验收标准**：
- [ ] 架构文档完整
- [ ] 使用指南清晰
- [ ] FAQ 覆盖常见问题
- [ ] 开发者文档完善

---

## 五、时间规划

| 任务 | 优先级 | 预计工作量 | 依赖 |
|------|--------|-----------|------|
| 任务 1：实现 Session 注入逻辑 | P0 | 已完成 | 无 |
| 任务 2：创建调试脚本 | P1 | 1 小时 | 任务 1 |
| 任务 3：测试验证 | P1 | 2-3 小时 | 任务 2 |
| 任务 4：文档完善 | P2 | 1-2 小时 | 任务 3 |

---

## 六、风险管理

### 6.1 技术风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| OpenCode 版本不兼容 | 配置无法加载 | 测试多个版本，提供降级方案 |
| AI 不完全遵守规则 | 生成质量下降 | 强化提示词，添加验证逻辑 |
| 注入逻辑影响性能 | Session 创建变慢 | 优化注入逻辑，控制文件IO |
| 清理不彻底 | 磁盘空间浪费 | 确保保存/删除时清理 .opencode |

### 6.2 业务风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| 用户需要自定义 | 灵活性不足 | 提供自定义接口和文档 |
| 规则过于严格 | AI 创造力受限 | 平衡约束与灵活性 |

---

## 七、验收标准

### 7.1 功能验收

- [ ] 创建 Session 时自动创建 `.opencode` 目录
- [ ] 代理配置格式正确，可被 OpenCode 加载
- [ ] AI 代理能按照提示词生成符合标准的文件
- [ ] 权限控制生效，AI 无法执行禁止操作
- [ ] Session 保存/删除时清理 `.opencode`

### 7.2 质量验收

- [ ] 生成的 `index.tsx` 符合 TypeScript 严格模式
- [ ] 生成的 `config.schema.json` 符合 JSON Schema 规范
- [ ] 代码风格统一，无 `as any` 等不安全代码
- [ ] 生成的代码可直接运行，无需额外修改

### 7.3 体验验收

- [ ] `.opencode` 配置自动注入，无需手动操作
- [ ] 配置自动生效，无需手动配置
- [ ] 文档完整，用户可以自行理解和修改

---

## 八、后续优化

### 8.1 短期优化（1-2 周）

1. 添加更多专用代理（如 `reviewer`、`tester`）
2. 支持动态规则加载（通过 `instructions` 字段）
3. 添加 AI 生成质量监控

### 8.2 中期优化（1-2 月）

1. 支持项目级规则自定义
2. 集成 CI/CD 自动验证生成质量
3. 提供规则模板库

### 8.3 长期优化（3-6 月）

1. 支持多代理协作（生成 + 审核 + 测试）
2. 智能规则推荐（根据项目特点）
3. AI 生成质量评分系统

---

## 附录

### A. 参考文档

- [OpenCode 配置文档](https://opencode.ai/docs/zh-cn/config/)
- [OpenCode 规则文档](https://opencode.ai/docs/zh-cn/rules/)
- [会话管理_需求文档](../项目文档/Web前端/会话管理/会话管理_需求文档.md)
- [01_架构设计](../项目文档/Web前端/会话管理/技术/01_架构设计.md)
- [02_草稿工作区](../项目文档/Web前端/会话管理/技术/02_草稿工作区.md)

### B. 相关文件

- `packages/web/src/lib/session-manager.ts` - Session 管理器（包含注入逻辑）
- `scripts/init-demo-agent.ps1` - 调试脚本
- `packages/web/lib/validator.ts` - 校验器
- `packages/web/lib/parser.ts` - 分隔符解析器

### C. 术语表

| 术语 | 说明 |
|------|------|
| OpenCode | AI 编程助手 |
| Agent | AI 代理，具有特定角色和能力 |
| ACP | Agent Client Protocol，代理通信协议 |
| Session | 编辑会话，关联 Demo 和临时工作区 |
| 临时工作区 | Session 中的隔离编辑环境 |
| JSON Schema | JSON 格式的配置定义规范 |
| Sandpack | 在线代码预览和运行环境 |
