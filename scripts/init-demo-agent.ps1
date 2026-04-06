# Demo Generator Agent 调试脚本
# 用途：手动在 Session 临时工作区中注入 .opencode 代理配置
# 使用场景：调试、测试、手动修复

param(
    [string]$SessionPath,
    [switch]$Force = $false
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色输出函数
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }

# 验证 Session 路径
if (-not $SessionPath) {
    Write-Error "未指定 Session 路径，使用 -SessionPath 参数"
    Write-Info "示例: .\scripts\init-demo-agent.ps1 -SessionPath '.\sessions\session-xxx'"
    exit 1
}

if (-not (Test-Path $SessionPath)) {
    Write-Error "Session 路径不存在: $SessionPath"
    exit 1
}

# 验证这是有效的 Session 目录（应包含 .session.json）
$SessionJson = Join-Path $SessionPath ".session.json"
if (-not (Test-Path $SessionJson)) {
    Write-Warn "警告：未找到 .session.json，这可能不是有效的 Session 目录"
    Write-Info "继续执行..."
}

Write-Info "开始在 Session 中注入 Demo Generator Agent 配置..."
Write-Info "Session 路径: $SessionPath"

try {
    # 设置 .opencode 目录路径
    $OpencodeDir = Join-Path $SessionPath ".opencode"
    $AgentsDir = Join-Path $OpencodeDir "agents"

    # 检查是否已存在
    if (Test-Path $OpencodeDir) {
        if ($Force) {
            Write-Warn ".opencode 目录已存在，使用 -Force 将覆盖..."
            Remove-Item -Path $OpencodeDir -Recurse -Force
        } else {
            Write-Warn ".opencode 目录已存在，跳过注入"
            Write-Info "使用 -Force 参数可强制覆盖"
            exit 0
        }
    }

    # 创建目录结构
    Write-Info "创建 .opencode 目录结构..."
    New-Item -Path $AgentsDir -ItemType Directory -Force | Out-Null

    # 创建 opencode.json
    Write-Info "创建 opencode.json..."
    $OpencodeJson = @{
        '$schema' = "https://opencode.ai/config.json"
        agent = @{
            'demo-generator' = @{
                file = ".opencode/agents/demo-generator.md"
                description = "专门用于生成 OpenCode Demo 文件的 AI 代理，生成 index.tsx 和 config.schema.json"
                tools = @{
                    write = $true
                    edit = $true
                    bash = $false
                    fetch = $false
                }
            }
        }
        default_agent = "demo-generator"
        instructions = @(".opencode/agents/demo-generator.md")
    }

    $OpencodeJson | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $OpencodeDir "opencode.json") -Encoding UTF8

    # 创建 demo-generator.md（简化版，适合 Session 临时工作区）
    Write-Info "创建 demo-generator.md..."
    $AgentMd = @"
# Demo Generator Agent

你是 OpenCode Workbench 的 Demo 生成专家。你的职责是根据用户需求，修改和生成符合 OpenCode 标准的 Demo 文件。

## 核心规则

### 工作文件要求
在 Session 工作区中，你只能操作以下两个文件：

1. **\`index.tsx\`** - React 组件实现
2. **\`config.schema.json\`** - Demo 配置定义

### 代码质量标准

**index.tsx 要求**：
- 使用 TypeScript，定义完整的 Props 接口（\`interface DemoProps\`）
- 使用 Tailwind CSS 进行样式设计（不使用内联 style）
- 可使用 shadcn/ui 组件库
- 导出默认组件
- 代码完整可运行，包含必要的 import

**config.schema.json 要求**：
- 符合 JSON Schema draft 2020-12 规范
- 包含 \`title\`、\`type\`、\`properties\`、\`required\`
- 每个属性都有合理的 \`default\` 值
- properties 与组件 Props 一一对应

### 禁止行为
- ❌ 修改 .session.json 或其他系统文件
- ❌ 创建除 index.tsx 和 config.schema.json 外的新文件
- ❌ 使用其他 UI 组件库（如 Ant Design、Material-UI）
- ❌ 使用 \`as any\`、\`@ts-ignore\`、\`@ts-expect-error\`
- ❌ 留下 TODO 或占位符

## 工作流程

1. 理解用户需求（修改或创建）
2. 如需新配置：先更新 config.schema.json
3. 根据 Schema 更新 index.tsx 的 Props 和实现
4. 验证两个文件的一致性

## 输出格式

修改完成后，直接写入文件，无需额外说明。

**自检清单**：
- [ ] 只修改了 index.tsx 和 config.schema.json
- [ ] Props 接口与 Schema properties 一一对应
- [ ] 没有使用不安全的类型转换
- [ ] 代码完整可运行
"@

    $AgentMd | Out-File -FilePath (Join-Path $AgentsDir "demo-generator.md") -Encoding UTF8

    Write-Success "Demo Generator Agent 配置注入完成！"
    Write-Info "Session 目录结构："
    Write-Info "  session-xxx/"
    Write-Info "  ├── index.tsx"
    Write-Info "  ├── config.schema.json"
    Write-Info "  ├── .session.json"
    Write-Info "  └── .opencode/"
    Write-Info "      ├── opencode.json"
    Write-Info "      └── agents/"
    Write-Info "          └── demo-generator.md"

} catch {
    Write-Error "配置注入失败: $_"
    exit 1
}
