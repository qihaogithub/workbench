"use client";

import { Download, Figma, Lock, Scissors, MousePointerClick, MousePointer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FigmaPluginPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border bg-muted/30">
        <div className="container px-4 py-10">
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Figma className="h-4 w-4" />
              Figma 插件
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Figma 插件安装指南
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              将 Figma 设计稿转换为 HTML 原型页，导入创作端进行 AI 处理与预览。
            </p>
          </div>
        </div>
      </section>

      <div className="container grid gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">下载安装包</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              下载插件安装包，按下方步骤在 Figma 桌面端中导入即可使用。
            </p>
            <Button asChild size="lg" className="gap-2">
              <a
                href="/figma-plugin/Figma-to-Code.zip"
                download="Figma to Code.zip"
              >
                <Download className="h-4 w-4" />
                下载 Figma 插件
              </a>
            </Button>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">安装步骤</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium">
                  1
                </div>
                <div className="space-y-2">
                  <div className="font-medium">下载并解压安装包</div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    点击上方按钮下载{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      Figma to Code.zip
                    </code>
                    ，解压后得到包含{" "}
                    <code className="rounded bg-muted px-1 text-xs">
                      manifest.json
                    </code>{" "}
                    的文件夹。
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium">
                  2
                </div>
                <div className="space-y-2">
                  <div className="font-medium">导入插件到 Figma</div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    打开 Figma 桌面端任意文件，在画布空白处右键选择{" "}
                    <strong>Plugins &gt; Development &gt; Import plugin from
                      manifest...</strong>
                    ，选择解压后的 <code className="rounded bg-muted px-1 text-xs">manifest.json</code>{" "}
                    文件，插件即安装完成。
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <img
                      src="/figma-plugin/install-menu.png"
                      alt="右键菜单 Plugins > Development > Import plugin from manifest"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">使用</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium">
                  <MousePointerClick className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                  <div className="font-medium">打开插件查看预览效果</div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    打开插件，选中 Figma 中任意设计稿 Frame，即可在插件中查看预览效果。
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <img
                      src="/figma-plugin/preview.png"
                      alt="Figma 插件预览效果"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium">
                  <Scissors className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                  <div className="font-medium">切图功能</div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    插件中的预览效果是转换为代码的实际效果，很多复杂图形会变形。
                    将不需要代码实现的元素选中后，点击左下角「切图」，即可将此元素设置为切图。
                    设为切图的元素会以图片形式插入代码中，就不会变形了。
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-medium">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                  <div className="font-medium">锁定预览图层</div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    点击插件左上角「锁」图标，可以锁定预览图层。锁定后选择图层时，预览页面始终保持锁定图层不变。
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border">
              <img
                src="/figma-plugin/tutorial-last.png"
                alt="Figma 插件使用教程"
                className="w-full"
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-medium">
              <Figma className="h-4 w-4" />
              关于插件
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Design Spec Live Preview (DSLP) Figma Plugin
              ——将 Figma 设计稿智能标记、资源预处理，并转换为 HTML 原型页代码，导入创作端进行 AI 处理与预览。
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-medium">
              <MousePointer className="h-4 w-4" />
              使用前提
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>需要 Figma 桌面客户端。</li>
              <li>仅 Design 模式文件可用，FigJam 文件不支持。</li>
              <li>插件会对复杂图形做代码转换，建议配合切图功能处理装饰性元素。</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 font-medium">
              <Download className="h-4 w-4" />
              快速下载
            </div>
            <div className="mt-3 space-y-2">
              <Button asChild variant="outline" className="w-full gap-2">
                <a
                  href="/figma-plugin/Figma-to-Code.zip"
                  download="Figma to Code.zip"
                >
                  <Download className="h-4 w-4" />
                  Figma to Code.zip
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                版本 1.0 · 更新于 2026-08-05
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
