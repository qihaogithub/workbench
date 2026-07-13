# 创作端应用 (Author Site)

<cite>
**本文引用的文件**   
- [packages/author-site/package.json](file://packages/author-site/package.json)
- [packages/author-site/src/middleware.ts](file://packages/author-site/src/middleware.ts)
- [packages/author-site/src/app/layout.tsx](file://packages/author-site/src/app/layout.tsx)
- [packages/author-site/src/app/page.tsx](file://packages/author-site/src/app/page.tsx)
- [packages/author-site/src/app/(auth)/layout.tsx](file://packages/author-site/src/app/(auth)/layout.tsx)
- [packages/author-site/src/app/(auth)/login/page.tsx](file://packages/author-site/src/app/(auth)/login/page.tsx)
- [packages/author-site/src/app/(auth)/register/page.tsx](file://packages/author-site/src/app/(auth)/register/page.tsx)
- [packages/author-site/src/app/(auth)/forgot-password/page.tsx](file://packages/author-site/src/app/(auth)/forgot-password/page.tsx)
- [packages/author-site/src/lib/auth/jwt.ts](file://packages/author-site/src/lib/auth/jwt.ts)
- [packages/author-site/src/lib/auth/password.ts](file://packages/author-site/src/lib/auth/password.ts)
- [packages/author-site/src/lib/admin-auth.ts](file://packages/author-site/src/lib/admin-auth.ts)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本技术文档面向 Workbench 创作端应用（Author Site），基于 Next.js 14 App Router 构建，覆盖路由组织、中间件机制与页面布局设计；深入说明用户认证系统（登录、注册、密码重置）的完整流程；描述管理后台权限控制与功能模块；解释 API 路由的设计模式（项目管理、文件操作等）；并给出前端状态管理策略、错误处理机制与性能优化方案。同时提供实际组件使用示例与开发最佳实践，帮助开发者快速理解与扩展该应用。

## 项目结构
创作端应用位于 packages/author-site 包内，采用 Next.js 14 App Router 的目录约定：
- src/app: 应用路由与页面布局
  - (auth): 认证相关页面分组（登录、注册、找回密码）
  - admin: 管理后台页面与子路由
  - api: API 路由（按功能域划分，如 auth、projects、sessions、demos、templates、knowledge 等）
  - demo、viewer、embed 等：演示与预览相关页面
- src/components: 可复用 UI 与业务组件
- src/hooks: 自定义 Hook（如协作文档 Hook）
- src/lib: 领域逻辑与工具库（鉴权、数据库、发布、工作区、预览等）
- public: 静态资源（预览运行时产物、缩略图等）
- scripts: 初始化与迁移脚本

```mermaid
graph TB
A["src/app<br/>路由与页面"] --> B["(auth)<br/>认证页面组"]
A --> C["admin<br/>管理后台"]
A --> D["api<br/>API 路由"]
A --> E["demo / viewer / embed<br/>演示与预览"]
F["src/components<br/>UI 与业务组件"] --> A
G["src/lib<br/>鉴权/数据库/发布/工作区等"] --> D
H["public<br/>静态资源"] --> A
```

图表来源
- [packages/author-site/src/app/layout.tsx:1-29](file://packages/author-site/src/app/layout.tsx#L1-L29)
- [packages/author-site/src/app/page.tsx:1-11](file://packages/author-site/src/app/page.tsx#L1-L11)

章节来源
- [packages/author-site/package.json:1-127](file://packages/author-site/package.json#L1-L127)
- [packages/author-site/src/app/layout.tsx:1-29](file://packages/author-site/src/app/layout.tsx#L1-L29)
- [packages/author-site/src/app/page.tsx:1-11](file://packages/author-site/src/app/page.tsx#L1-L11)

## 核心组件
- 根布局 RootLayout
  - 设置全局元信息、主题、提示框与 Tooltip 上下文，确保全应用一致的体验。
- 首页 Page
  - 通过服务端调用项目管理服务获取初始数据，并以 props 形式注入到客户端组件渲染。
- 认证布局 AuthLayout
  - 为登录/注册/找回密码等页面提供统一的居中布局样式。

章节来源
- [packages/author-site/src/app/layout.tsx:1-29](file://packages/author-site/src/app/layout.tsx#L1-L29)
- [packages/author-site/src/app/page.tsx:1-11](file://packages/author-site/src/app/page.tsx#L1-L11)
- [packages/author-site/src/app/(auth)/layout.tsx](file://packages/author-site/src/app/(auth)/layout.tsx#L1-L12)

## 架构总览
整体架构围绕 Next.js 14 App Router 展开：
- 中间件统一处理跨域、认证与管理后台鉴权
- 页面层负责展示与交互，通过 API 路由访问后端能力
- 认证体系基于 JWT Cookie 与企业账号（钉钉）集成
- 管理后台通过 Admin Secret 进行访问控制

```mermaid
graph TB
subgraph "浏览器"
UI["页面与组件"]
end
subgraph "Next.js 应用"
MW["中间件<br/>CORS/认证/管理员鉴权"]
Pages["App Router 页面"]
API["API 路由"]
Lib["领域库<br/>鉴权/数据库/发布/工作区"]
end
subgraph "外部服务"
DB["SQLite/文件系统"]
OSS["对象存储"]
DingTalk["钉钉企业登录"]
end
UI --> Pages
Pages --> API
API --> Lib
Lib --> DB
Lib --> OSS
Pages --> MW
API --> MW
UI --> MW
Pages --> DingTalk
```

图表来源
- [packages/author-site/src/middleware.ts:1-153](file://packages/author-site/src/middleware.ts#L1-L153)
- [packages/author-site/src/app/layout.tsx:1-29](file://packages/author-site/src/app/layout.tsx#L1-L29)
- [packages/author-site/src/app/page.tsx:1-11](file://packages/author-site/src/app/page.tsx#L1-L11)

## 详细组件分析

### 路由组织与中间件机制
- 路由组织
  - 使用 App Router 的分组路由 (auth) 将认证页面聚合，便于统一布局与守卫。
  - admin 目录承载管理后台页面，配合中间件进行访问控制。
  - api 目录按功能域拆分，如 auth、projects、sessions、demos、templates、knowledge 等，职责清晰。
- 中间件职责
  - CORS 预检与响应头设置，支持受控域名白名单与公共模块开放策略。
  - 用户认证：解析 auth_token Cookie，校验 JWT，对受保护页面/API 进行拦截。
  - 管理后台鉴权：验证 Admin Secret（URL 参数或 Cookie），必要时设置 admin_token Cookie。
  - 重定向与错误响应：未登录时重定向至登录页或返回 401 JSON。

```mermaid
sequenceDiagram
participant Client as "客户端"
participant MW as "中间件"
participant Page as "页面/API"
participant JWT as "JWT 校验"
participant Admin as "管理员鉴权"
Client->>MW : 请求 /demo 或 /api/sessions
MW->>MW : 解析 origin 与路径
MW->>JWT : 读取 Cookie 并验证 token
alt 未登录且受保护
MW-->>Client : 重定向 /login?redirect=... 或 401 JSON
else 已登录
MW->>Admin : 若访问 /admin 或 /api/admin/*
Admin-->>MW : 验证 Admin Secret
alt 未授权
MW-->>Client : 401 JSON
else 已授权
MW-->>Page : 放行
Page-->>Client : 正常响应
end
end
```

图表来源
- [packages/author-site/src/middleware.ts:1-153](file://packages/author-site/src/middleware.ts#L1-L153)
- [packages/author-site/src/lib/auth/jwt.ts:1-71](file://packages/author-site/src/lib/auth/jwt.ts#L1-L71)
- [packages/author-site/src/lib/admin-auth.ts:1-135](file://packages/author-site/src/lib/admin-auth.ts#L1-L135)

章节来源
- [packages/author-site/src/middleware.ts:1-153](file://packages/author-site/src/middleware.ts#L1-L153)

### 用户认证系统（登录、注册、密码重置）
- 登录流程
  - 客户端提交用户名与密码至 /api/auth/login，成功后设置 auth_token Cookie，跳转回目标页面。
  - 支持钉钉企业账号登录：在钉钉环境内获取免登码后回调 /api/auth/dingtalk/login，完成登录后同样设置 Cookie 并重定向。
- 注册流程
  - 客户端提交用户名与密码至 /api/auth/register，成功后自动登录并跳转首页。
- 密码重置
  - 当前版本不支持自助找回密码，页面引导联系管理员重置。
- 安全与校验
  - 密码强度与用户名格式在服务端校验。
  - 密码使用 bcrypt 加盐哈希存储。
  - JWT 有效期 7 天，Cookie 配置 httpOnly、sameSite=lax，生产环境默认 secure。

```mermaid
sequenceDiagram
participant User as "用户"
participant Login as "登录页面"
participant API as "/api/auth/login"
participant JWT as "JWT 工具"
participant Cookie as "Cookie 设置"
User->>Login : 输入用户名/密码
Login->>API : POST {username,password}
API-->>Login : {success,data.user}
Login->>JWT : 创建 Token
JWT->>Cookie : 设置 auth_token
Login-->>User : 跳转 redirect 页面
```

图表来源
- [packages/author-site/src/app/(auth)/login/page.tsx](file://packages/author-site/src/app/(auth)/login/page.tsx#L1-L213)
- [packages/author-site/src/lib/auth/jwt.ts:1-71](file://packages/author-site/src/lib/auth/jwt.ts#L1-L71)

```mermaid
sequenceDiagram
participant User as "用户"
participant Register as "注册页面"
participant API as "/api/auth/register"
participant JWT as "JWT 工具"
participant Cookie as "Cookie 设置"
User->>Register : 输入用户名/密码
Register->>API : POST {username,password}
API-->>Register : {success,data.user}
Register->>JWT : 创建 Token
JWT->>Cookie : 设置 auth_token
Register-->>User : 跳转首页
```

图表来源
- [packages/author-site/src/app/(auth)/register/page.tsx](file://packages/author-site/src/app/(auth)/register/page.tsx#L1-L52)
- [packages/author-site/src/lib/auth/jwt.ts:1-71](file://packages/author-site/src/lib/auth/jwt.ts#L1-L71)

```mermaid
flowchart TD
Start(["进入找回密码页面"]) --> Info["提示暂不支持自助找回"]
Info --> Guide["引导联系管理员重置"]
Guide --> End(["返回登录页"])
```

图表来源
- [packages/author-site/src/app/(auth)/forgot-password/page.tsx](file://packages/author-site/src/app/(auth)/forgot-password/page.tsx#L1-L44)

章节来源
- [packages/author-site/src/app/(auth)/login/page.tsx](file://packages/author-site/src/app/(auth)/login/page.tsx#L1-L213)
- [packages/author-site/src/app/(auth)/register/page.tsx](file://packages/author-site/src/app/(auth)/register/page.tsx#L1-L52)
- [packages/author-site/src/app/(auth)/forgot-password/page.tsx](file://packages/author-site/src/app/(auth)/forgot-password/page.tsx#L1-L44)
- [packages/author-site/src/lib/auth/jwt.ts:1-71](file://packages/author-site/src/lib/auth/jwt.ts#L1-L71)
- [packages/author-site/src/lib/auth/password.ts:1-35](file://packages/author-site/src/lib/auth/password.ts#L1-L35)

### 管理后台权限控制与功能模块
- 权限控制
  - 中间件对 /admin 与 /api/admin/* 进行鉴权，支持 URL 参数 secret 或 admin_token Cookie。
  - 首次通过 URL 参数访问时，中间件会设置 admin_token Cookie，后续无需重复传参。
- 功能模块
  - 模型配置、后端提供者同步、知识库管理等页面位于 admin 目录下，具体实现由各路由页面与对应 API 组成。
- 安全建议
  - 生产环境务必设置强随机 ADMIN_SECRET，并确保 HTTPS 部署以启用 secure Cookie。

```mermaid
sequenceDiagram
participant Admin as "管理员"
participant MW as "中间件"
participant AdminLib as "管理员鉴权库"
participant Page as "管理后台页面"
Admin->>MW : GET /admin?secret=xxx
MW->>AdminLib : verifyAdminSecret(request)
AdminLib-->>MW : true/false
alt 未授权
MW-->>Admin : 401 JSON
else 已授权
MW->>MW : 设置 admin_token Cookie
MW-->>Page : 放行
Page-->>Admin : 渲染管理后台
end
```

图表来源
- [packages/author-site/src/middleware.ts:100-135](file://packages/author-site/src/middleware.ts#L100-L135)
- [packages/author-site/src/lib/admin-auth.ts:1-135](file://packages/author-site/src/lib/admin-auth.ts#L1-L135)

章节来源
- [packages/author-site/src/middleware.ts:100-135](file://packages/author-site/src/middleware.ts#L100-L135)
- [packages/author-site/src/lib/admin-auth.ts:1-135](file://packages/author-site/src/lib/admin-auth.ts#L1-L135)

### API 路由设计模式（项目管理与文件操作）
- 设计模式
  - 按功能域组织路由：auth、projects、sessions、demos、templates、knowledge、workspace-authority 等，便于维护与权限控制。
  - 典型接口包括：
    - 项目管理：/api/projects/[projectId]/config、/api/projects/[projectId]/demos、/api/projects/[projectId]/publish 等
    - 文件操作：/api/sessions/[sessionId]/files、/api/workspace-authority/[projectId]/[workspaceId]/[...segments] 等
    - 模板与知识：/api/templates、/api/knowledge
- 权限与安全
  - 受保护的 API（如 /api/sessions）由中间件统一校验用户身份，未登录返回 401 JSON。
  - 管理后台相关 API（/api/admin/*）需通过 Admin Secret 鉴权。

```mermaid
graph LR
P["/api/projects/[projectId]"] --> PC["/config"]
P --> PD["/demos"]
P --> PP["/publish"]
S["/api/sessions/[sessionId]"] --> SF["/files"]
S --> SM["/messages"]
WA["/api/workspace-authority/[projectId]/[workspaceId]/[...segments]"] --> WF["文件读写/权限校验"]
```

图表来源
- [packages/author-site/src/app/api](file://packages/author-site/src/app/api)

章节来源
- [packages/author-site/src/middleware.ts:89-98](file://packages/author-site/src/middleware.ts#L89-L98)

### 前端状态管理与错误处理
- 状态管理策略
  - 页面级初始数据通过服务端渲染注入（如首页从项目管理服务拉取）。
  - 客户端交互状态使用 React useState/useEffect 管理，结合 Toast 反馈用户操作结果。
  - 可选引入 SWR 进行数据缓存与增量更新（已在依赖中声明）。
- 错误处理机制
  - 登录/注册失败时统一捕获错误并通过 Toast 展示。
  - 中间件对未登录与未授权场景返回标准 JSON 错误结构，便于前端统一处理。

章节来源
- [packages/author-site/src/app/page.tsx:1-11](file://packages/author-site/src/app/page.tsx#L1-L11)
- [packages/author-site/src/app/(auth)/login/page.tsx](file://packages/author-site/src/app/(auth)/login/page.tsx#L85-L113)
- [packages/author-site/src/app/(auth)/register/page.tsx](file://packages/author-site/src/app/(auth)/register/page.tsx#L14-L38)
- [packages/author-site/src/middleware.ts:89-98](file://packages/author-site/src/middleware.ts#L89-L98)

### 组件使用示例与开发最佳实践
- 组件使用示例
  - 登录表单复用：登录与注册页面共用 LoginForm 组件，减少重复代码。
  - 主题与提示：通过 ThemeProvider 与 ToastProviderWrapper 在全局提供主题与消息提示能力。
- 最佳实践
  - 路由分组：将认证相关页面放入 (auth) 分组，便于统一布局与守卫。
  - 中间件前置校验：所有敏感页面与 API 均通过中间件进行统一鉴权，避免在各页面重复实现。
  - 环境变量安全：严格管理 JWT_SECRET、ADMIN_SECRET、CORS_ORIGINS 等敏感配置。
  - 错误反馈：统一使用 Toast 向用户反馈成功与失败信息，提升用户体验。

章节来源
- [packages/author-site/src/app/(auth)/login/page.tsx](file://packages/author-site/src/app/(auth)/login/page.tsx#L1-L213)
- [packages/author-site/src/app/(auth)/register/page.tsx](file://packages/author-site/src/app/(auth)/register/page.tsx#L1-L52)
- [packages/author-site/src/app/layout.tsx:1-29](file://packages/author-site/src/app/layout.tsx#L1-L29)

## 依赖分析
- 关键依赖
  - next: 14.1.0（App Router）
  - jose: JWT 签名与验证
  - bcrypt: 密码哈希
  - better-sqlite3: 本地数据库
  - swr: 客户端数据缓存与增量更新
  - @radix-ui/*: 基础 UI 组件
  - tailwindcss: 样式框架
- 内部包依赖
  - @workbench/project-core、@workbench/shared、@workbench/sketch-core 等，用于项目、共享与画布能力。

```mermaid
graph TB
Author["author-site"] --> Next["next 14"]
Author --> Jose["jose"]
Author --> Bcrypt["bcrypt"]
Author --> SQLite["better-sqlite3"]
Author --> SWR["swr"]
Author --> Radix["@radix-ui/*"]
Author --> Tailwind["tailwindcss"]
Author --> Shared["@workbench/shared"]
Author --> ProjectCore["@workbench/project-core"]
Author --> SketchCore["@workbench/sketch-core"]
```

图表来源
- [packages/author-site/package.json:1-127](file://packages/author-site/package.json#L1-L127)

章节来源
- [packages/author-site/package.json:1-127](file://packages/author-site/package.json#L1-L127)

## 性能考虑
- 服务端渲染与动态数据
  - 首页使用 force-dynamic 强制动态渲染，确保每次请求获取最新项目列表。
- 中间件开销
  - 中间件仅执行必要的鉴权与 CORS 处理，避免不必要的计算。
- 静态资源与 CDN
  - 预览运行时产物与缩略图放置于 public，可通过 CDN 加速。
- 客户端缓存
  - 可使用 SWR 对频繁读取的数据进行缓存与增量更新，降低网络请求压力。

章节来源
- [packages/author-site/src/app/page.tsx:1-11](file://packages/author-site/src/app/page.tsx#L1-L11)
- [packages/author-site/src/middleware.ts:1-153](file://packages/author-site/src/middleware.ts#L1-L153)

## 故障排查指南
- 登录失败
  - 检查用户名与密码是否符合校验规则（长度、字符集）。
  - 确认 /api/auth/login 返回的 success 字段与 error.message。
- 未登录被重定向
  - 检查 auth_token Cookie 是否存在且有效，确认中间件是否放行。
- 管理后台无法访问
  - 确认 ADMIN_SECRET 是否正确，首次访问需携带 ?secret=xxx，或通过 Cookie 访问。
- 跨域问题
  - 检查 CORS_ORIGINS 配置，确保请求 origin 在白名单内。

章节来源
- [packages/author-site/src/lib/auth/password.ts:16-34](file://packages/author-site/src/lib/auth/password.ts#L16-L34)
- [packages/author-site/src/middleware.ts:18-37](file://packages/author-site/src/middleware.ts#L18-L37)
- [packages/author-site/src/lib/admin-auth.ts:19-56](file://packages/author-site/src/lib/admin-auth.ts#L19-L56)

## 结论
创作端应用基于 Next.js 14 App Router 构建了清晰的路由与中间件体系，实现了完善的用户认证与管理后台权限控制。API 路由按功能域组织，职责明确，便于扩展与维护。通过服务端渲染与客户端缓存相结合的策略，兼顾了首屏性能与交互体验。建议在后续迭代中持续完善错误处理与监控告警，进一步提升系统的稳定性与可观测性。

## 附录
- 环境变量建议
  - JWT_SECRET：JWT 密钥，生产环境必须强随机。
  - ADMIN_SECRET：管理后台访问密钥，生产环境必须强随机。
  - CORS_ORIGINS：允许的跨域源，逗号分隔。
  - USE_SECURE_COOKIE：生产环境默认启用 secure Cookie，可在 HTTP 内网部署时禁用。