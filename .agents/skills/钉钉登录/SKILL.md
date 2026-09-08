---
name: dingtalk-login-integration
description: 通用钉钉登录集成 skill。用于 React 前端与 Spring Boot 后端接入或排查钉钉 OAuth 登录、免登、回调 code 或 authCode 换登录态、账号同步、unionId/email/mobile 匹配、JWT 或 Cookie 登录态、钉钉工作通知桥接、环境变量、Docker、反向代理、CORS、SameSite/Secure 与部署配置问题。适合把既有项目迁移到钉钉登录、为新项目设计钉钉认证链路、梳理钉钉登录流程文档或排查回调失败、用户信息缺失、部门岗位补全失败、登录态丢失等问题。
---

# DingTalk Login Integration

## Overview

Use this skill to design, implement, document, or troubleshoot a reusable DingTalk login integration for a React frontend and a Spring Boot backend. Keep the main flow generic: frontend builds the DingTalk OAuth URL, callback receives `code` or `authCode`, backend exchanges it for a DingTalk profile, account bridge creates or updates the local user, token bridge issues the local login state, then frontend redirects back to the original target.

Do not copy project-specific `.env` values, secrets, tenant identifiers, or private routes into generated output. Use placeholders and ask the user to supply secret values through their normal configuration channel.

## Reference Map

- `references/architecture-and-flow.md`: read first for the end-to-end login sequence, route contract, state handling, and redirect closure.
- `references/frontend-integration.md`: read when adding or modifying the React login page, callback page, `DingtalkAuthClient`, redirect storage, or route guards.
- `references/backend-integration.md`: read when wiring Spring Boot controllers, `DingtalkAuthFacade`, `DingtalkApiClient`, `DingtalkUserBridge`, `DingtalkTokenBridge`, JWT, or Cookie login state.
- `references/config-and-deploy.md`: read when configuring environment variables, Docker, reverse proxy, callback domains, CORS, Cookie attributes, or deployment differences.
- `references/user-sync-and-troubleshooting.md`: read when defining account matching, user creation or update rules, department or job-title backfill, disabled accounts, or common error diagnosis.

## Working Order

1. Identify whether the task is about flow design, frontend, backend, deployment, user sync, or troubleshooting.
2. Read `architecture-and-flow.md` first unless the task is a narrow configuration or bug report.
3. Load only the reference file that matches the current subsystem, then inspect the target project for its existing auth, routing, API, and persistence conventions.
4. Preserve the host project's local user model, authorization semantics, token shape, cookie policy, route names, and deployment conventions unless the user explicitly asks to change them.
5. Keep DingTalk API details behind backend services or package clients; do not spread OAuth, token exchange, or organization lookup logic across frontend pages.
6. Treat `clientSecret`, `appSecret`, `corpId`, `agentId`, and real redirect URLs as environment-specific configuration. Never invent or reveal real values.
7. Validate with focused tests or manual checks for login URL generation, callback handling, account matching, login-state persistence, and protected-route access.

## Output Expectations

When using this skill, report:

- The flow branch used: login initiation, callback exchange, account sync, token issuance, deployment config, notification bridge, or troubleshooting.
- The public interfaces or routes added or changed.
- Which identity fields are authoritative for matching users.
- Whether the final login state is Authorization header, HttpOnly Cookie, or both.
- Configuration keys required, with placeholders only.
- Verification performed and any remaining live DingTalk-console checks that require tenant credentials.

## Guardrails

- Prefer backend code exchange over frontend token exchange. The frontend should receive only the local application login result.
- Keep `state` validation and post-login redirect normalization in the frontend or shared auth client.
- Avoid open redirects: block absolute external redirects unless there is an explicit allowlist.
- Put local account status checks before issuing a token and before returning current-user data.
- Redact or omit token fields from JSON responses if using HttpOnly Cookie login state.
- Make local development, staging, and production callback URLs explicit; DingTalk callback configuration must match the deployed callback URL exactly.
