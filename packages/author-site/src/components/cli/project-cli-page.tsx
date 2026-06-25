"use client";

import { useState } from "react";
import {
  Check,
  Clipboard,
  FileJson,
  FileText,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface ProjectCliPageProps {
  usagePrompt: string;
  quickReference: string;
  updatedAt: string;
  version: string;
}

type CopyTarget = "prompt" | "reference";

export function ProjectCliPage({
  usagePrompt,
  quickReference,
  updatedAt,
  version,
}: ProjectCliPageProps) {
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
              <Terminal className="h-4 w-4" />
              Project Admin CLI
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              用 CLI 管理创作端项目
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              面向编码代理的本地 shell 入口。项目、模板、页面、配置、事务、资产、发布检查和审计都通过 JSON-first 命令执行，业务规则统一由 project-core 校验。
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
                ["项目与模板", "创建、复制、删除预览、模板快照、推荐和健康检查。"],
                ["页面与文件夹", "事务内创建、重命名、排序、移动和批量删除。"],
                ["配置与校验", "项目级 Schema、页面 Schema、冲突检查和候选生成。"],
                ["资产与预览", "图片上传、替换、引用扫描、预览入口和健康检查。"],
                ["发布与审计", "发布前检查、发布状态、回滚和操作记录。"],
                ["Agent 输入", "支持 --json、--stdin、--input-json、@file 和资产 --file。"],
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
                <h2 className="text-xl font-semibold">复制到 Agent</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  粘贴后先做只读自检，再执行项目写操作。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => copyText("prompt", usagePrompt)}
              >
                {copyIcon("prompt")}
                复制提示词
              </Button>
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6">
              {usagePrompt}
            </pre>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">常用命令</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  所有关键命令都可追加 --json 供 Agent 稳定解析。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => copyText("reference", quickReference)}
              >
                {copyIcon("reference")}
                复制命令
              </Button>
            </div>
            <pre className="overflow-auto rounded-lg border border-border bg-card p-4 text-sm leading-6">
              {quickReference}
            </pre>
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
              <FileJson className="h-4 w-4" />
              JSON 约定
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              成功响应包含 ok 和 data，失败响应包含 error.code、error.message 和 nextActions。Agent 不需要解析人类可读文本。
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4" />
              常见问题
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>无权限时，只能读取允许项目，请检查 PROJECT_ADMIN_ALLOWED_PROJECTS。</p>
              <p>事务冲突时，重新打开编辑事务并基于最新项目修改。</p>
              <p>截图和完整发布产物仍按各服务健康状态返回明确降级原因。</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
