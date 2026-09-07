# Agent 运行时内置 Skill

> 本目录维护 `@workbench/agent-service` 运行时内置 Skill 的当前清单、加载机制和使用边界。

## 文档列表

| 文档 | 说明 | 状态 |
| :--- | :--- | :--- |
| [01_预装Skill清单与加载机制.md](./01_预装Skill清单与加载机制.md) | 运行时内置 Skill 清单、触发场景、加载流程和权限边界 | 已更新 |

## 维护入口

- Skill 的实际指令正文位于 [`packages/agent-service/src/preinstalled-skills/`](../../../../packages/agent-service/src/preinstalled-skills/)。
- 新增、删除或重命名运行时 Skill 后，先更新对应源码 Skill 的 frontmatter，再同步更新 [预装 Skill 清单与加载机制](./01_预装Skill清单与加载机制.md)。
- Agent 服务层的整体架构和接口说明见 [独立 Agent 服务层索引](../README.md)。
