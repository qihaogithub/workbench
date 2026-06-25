"use client";

import { useState } from "react";
import {
  Check,
  Clipboard,
  FileText,
  KeyRound,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface McpInstallPageProps {
  installPrompt: string;
  localConfig: string;
  remoteConfig: string;
  updatedAt: string;
  version: string;
}

type CopyTarget = "prompt" | "local" | "remote";

export function McpInstallPage({
  installPrompt,
  localConfig,
  remoteConfig,
  updatedAt,
  version,
}: McpInstallPageProps) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const copyText = async (target: CopyTarget, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(target);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const copyIcon = (target: CopyTarget) =>
    copied === target ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border bg-muted/30">
        <div className="container px-4 py-10">
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Server className="h-4 w-4" />
              Project Admin MCP
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              用 Codex 管理创作端项目
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              面向管理员、开发者和高级创作者的确定性项目管理入口。项目、模板、页面、配置、事务、发布检查和审计都通过 MCP 工具执行，普通创作流程仍保留在 Web 页面中。
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>版本 {version}</span>
              <span>更新于 {updatedAt}</span>
              <span>复制内容不包含真实密钥</span>
            </div>
          </div>
        </div>
      </section>

      <div className="container grid gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">能力范围</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["项目与模板", "创建、复制、删除预览、模板快照和推荐。"],
                ["页面与文件夹", "事务内创建、重命名、排序、移动和批量删除。"],
                ["配置与校验", "项目级 Schema、页面 Schema、冲突检查和候选生成。"],
                ["预览与发布", "编译预检、发布检查、发布状态和回滚入口。"],
                ["审计与权限", "记录写操作、操作者、差异摘要和确认计划。"],
                ["安装分发", "Codex 提示词、本地 stdio 与远程 HTTP 配置片段。"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-border bg-card p-4">
                  <div className="font-medium">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">复制到 Codex</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  粘贴后先做只读自检，再执行项目写操作。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => copyText("prompt", installPrompt)}
              >
                {copyIcon("prompt")}
                复制提示词
              </Button>
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6">
              {installPrompt}
            </pre>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <ConfigBlock
              title="本地 stdio"
              description="适合管理员和本地开发者，直接访问本机 DATA_DIR。"
              icon={<Terminal className="h-4 w-4" />}
              text={localConfig}
              copied={copied === "local"}
              onCopy={() => copyText("local", localConfig)}
            />
            <ConfigBlock
              title="远程 HTTP"
              description="适合团队高级用户，通过服务地址和 token 访问授权项目。"
              icon={<KeyRound className="h-4 w-4" />}
              text={remoteConfig}
              copied={copied === "remote"}
              onCopy={() => copyText("remote", remoteConfig)}
            />
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              安全规则
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>写操作必须在编辑事务内完成。</li>
              <li>删除、发布、回滚需要预览计划和确认 token。</li>
              <li>不要直接编辑 data/、project.json 或 workspace-tree.json。</li>
              <li>复制内容只包含占位符，真实 token 由用户手动填写。</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4" />
              常见问题
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>无权限时，只能读取介绍和只读资源，请联系管理员授权项目。</p>
              <p>连接失败时，先检查 MCP 命令、DATA_DIR、服务地址和 token 是否配置。</p>
              <p>事务冲突时，重新打开编辑事务并基于最新项目修改。</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ConfigBlock({
  title,
  description,
  icon,
  text,
  copied,
  onCopy,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2 font-medium">
            {icon}
            {title}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          复制
        </Button>
      </div>
      <pre className="max-h-[320px] overflow-auto p-4 text-xs leading-5">{text}</pre>
    </div>
  );
}
