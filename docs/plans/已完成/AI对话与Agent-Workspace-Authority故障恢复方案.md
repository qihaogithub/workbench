---
covers:
  - packages/agent-service/src/workspace/workspace-recovery.ts
  - packages/agent-service/src/workspace/workspace-mutation-authority.ts
  - packages/agent-service/src/routes/workspace-authority.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/api/sessions/[sessionId]/assets/localize/route.ts
  - OPS/CLI/src/commands/workspace-recovery.ts
  - scripts/check-workspace-authority-guards.mjs
---

# AI 对话与 Agent — Workspace Authority 故障恢复方案

> 状态：已完成
> 日期：2026-09-09

## 根因与范围

故障 Workspace 的 committed root 与磁盘受管内容漂移，且 committed backup 大量缺失，因此 mutation 在 prepare 前被 `WORKSPACE_AUTHORITY_BACKUP_MISSING` 拒绝。无 receipt 的浏览器临时预览和全局图片入库曾被误认为页面已保存。现有 journal 不足以唯一还原首个旁路写入进程，但已确认并封堵普通 mutation、Pi 文件工具和旧整目录同步的静默 adopt/覆盖边界。

本次只修复平台并从可信 v41 重建，未重做两个原始页面任务，也未将已入库图片写入页面。

## 完成结果

- 新增管理员 recovery dry-run/apply API 与 CLI，通过项目锁、快照 root proof、恢复包、新 Workspace Authority bootstrap、目录切换与元数据 CAS 实现可恢复的原子重建。
- 删除 `sync-project` 整目录覆盖旁路和所有隐式 drift adopt；静态守卫阻止新的 live Workspace 直写入口。
- health 收敛为四态 condition，返回 recommended action 和去重后的缺失 backup hash 数。
- 编辑页保存收敛为显式状态机；失败保留 dirty 草稿，严重 Authority 错误触发 Workspace 级熔断，AI 发送前始终执行 health preflight。
- AI 流式内容只进 preview overlay，仅 Authority committed event 刷新 canonical 状态；诊断区分 local preview、persistence receipt 和 projection。
- Authority 稳定错误码穿透到页面保存、collab flush 和资产本地化接口；资产部分成功会返回非 2xx 和可复用 image ID。

## 实际恢复与验收

- recovery ID：`recovery-7ff07028dea1da33241e`
- 来源：`v41`，rootHash `c9fb6837e518df2f8da058a9fda9eaf92a07e5ec8209da87525253736addb85a`
- 历史：新增 `v42 restore_snapshot`
- 旧故障 Workspace `live-1785205322879-latagwnoh` 及 8 个绑定 Session 已归档，恢复包保留 Authority staging 和现场摘要。
- 新 Session 当前绑定 `live-1788939471825-xfbgs0mgn`；严格 preflight `passed=true`，revision 1，root/actualRoot 一致，无 drift、缺 backup、lease、prepared 或 staging。
- 浏览器已验证项目正常打开、显示“已自动保存”，刷新后 Workspace ID 不变。
- 最终复查发现 recovery Workspace 初始 `baseVersion` 错绑源版本 v41，会在首个 Session 时被当作过期。已修为创建时绑定本次恢复生成的新版本（v42），并增加回归断言；本次已产生的中间 Workspace 保留并标记归档。

## 验证记录

- agent-service recovery/Authority/route 定向测试：48 项通过；typecheck 通过。
- author-site 保存状态/flush/资产定向测试：42 项通过；typecheck 通过。
- OPS CLI：21 项通过；build 通过。
- `check:workspace-authority` 通过。
- 全量 agent-service 套件中仍有 11 个与本改动无关的既有 model/image mock 与 preview 权限预期失败；本次相关套件已独立通过。

## 保留材料

恢复包位于 `data/workspace-recovery/recovery-7ff07028dea1da33241e/`，不应被普通 retention 清理。
