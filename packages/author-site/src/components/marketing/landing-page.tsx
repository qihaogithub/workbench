import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ClipboardCheck,
  Eye,
  FileStack,
  Gauge,
  GitBranch,
  HardHat,
  Layers3,
  Network,
  PackageCheck,
  RefreshCcw,
  Ruler,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

const painPoints = [
  {
    icon: Network,
    title: "能力边界反复解释",
    description:
      "活动类型、配置范围和实现方式散落在不同角色与沟通记录中，每次都要重新确认。",
  },
  {
    icon: Ruler,
    title: "资源规范难以验证",
    description:
      "图片、动效和文案离开真实页面后很难判断效果，问题往往在交付后段才暴露。",
  },
  {
    icon: RefreshCcw,
    title: "经验没有进入下一次",
    description:
      "页面、规范和结论停留在一次性项目里，新活动仍从找资料、补上下文开始。",
  },
] as const;

const currentCapabilities = [
  {
    icon: BrainCircuit,
    title: "理解目标与现有能力",
    description:
      "基于团队已沉淀的产品能力、设计规范和历史经验，结合活动目标，帮助团队找到合适的活动路径。",
  },
  {
    icon: FileStack,
    title: "组织可讨论的交付上下文",
    description:
      "生成活动方案、可交互原型、配置清单和资源要求，让所有角色围绕同一份项目协作。",
  },
  {
    icon: Eye,
    title: "在真实页面里提前验证",
    description:
      "通过配置、资源上传和实时预览尽早检查效果，再进入开发接入和人工验收。",
  },
] as const;

const workflow = [
  ["01", "提出活动目标", "明确受众、业务目标、玩法与体验方向。", Target],
  ["02", "AI 整理方案", "匹配现有能力，生成原型、配置与资源清单。", Bot],
  ["03", "配置资源预览", "把文案和视觉资源放进真实页面验证。", Layers3],
  ["04", "团队在线协作", "围绕同一份项目补充规则、标准与例外。", UsersRound],
  [
    "05",
    "人工验收接入",
    "由专业角色确认效果、边界和上线条件。",
    ClipboardCheck,
  ],
  [
    "06",
    "经验沉淀复用",
    "将有效页面、模板、规范和知识留给下一次。",
    RefreshCcw,
  ],
] as const;

const managementValues = [
  {
    icon: Gauge,
    title: "减少协作消耗",
    description:
      "让可规则化的查询、整理和初版生成由 AI 承接，把团队时间还给判断与创新。",
  },
  {
    icon: PackageCheck,
    title: "把问题前移",
    description:
      "让资源和方案更早进入真实页面，避免在开发接入或验收阶段才发现理解偏差。",
  },
  {
    icon: GitBranch,
    title: "形成组织资产",
    description:
      "让页面、模板、设计规范和项目知识持续复用，而不是随一次活动结束而消失。",
  },
] as const;

export function LandingPage() {
  return (
    <div className="landing-shell min-h-screen overflow-hidden text-foreground">
      <SiteHeader />

      <main>
        <section className="landing-hero relative isolate border-b border-white/[0.08] px-4 pb-24 pt-20 sm:px-6 sm:pt-28 lg:px-8 lg:pb-32">
          <div className="landing-hero-grid pointer-events-none absolute inset-0 -z-10" />
          <div className="landing-container mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <div className="landing-reveal max-w-3xl">
              <div className="landing-eyebrow mb-7 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                面向营销活动业务的 AI 协作平台
              </div>
              <h1 className="landing-display max-w-3xl">
                真正耗时的，
                <span className="landing-display-accent mt-2 block">
                  是一个人的想法反复翻译给另一个人
                </span>
              </h1>
              <p className="landing-hero-copy mt-7 max-w-2xl text-base sm:text-lg">
                OneFlow
                把分散的活动目标、产品能力、设计规范和项目经验组织到同一个工作台，让团队从一句目标出发，更快形成可讨论、可预览、可验收的交付结果。
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="landing-primary-button group h-12 gap-2 px-6"
                >
                  <Link href="/workbench">
                    进入工作台{" "}
                    <ArrowRight className="landing-cta-arrow h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="landing-secondary-button h-12 border-white/15 px-6"
                >
                  <Link href="/manual">阅读用户手册</Link>
                </Button>
              </div>
              <div className="landing-proof-row mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  目标到原型
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  资源到预览
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  经验到复用
                </span>
              </div>
              <nav
                className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-xs"
                aria-label="首页内容导航"
              >
                <Link className="landing-section-link" href="#current">
                  了解当前能力
                </Link>
                <Link className="landing-section-link" href="#workflow">
                  查看交付工作流
                </Link>
                <Link className="landing-section-link" href="#roadmap">
                  现在与未来 <span aria-hidden="true">↗</span>
                </Link>
              </nav>
            </div>

            <figure
              className="landing-preview-stage landing-reveal landing-reveal-delay-2 relative mx-auto w-full max-w-xl"
              aria-label="OneFlow 活动交付链路示意"
            >
              <div className="landing-preview-glow absolute -inset-8 rounded-[2rem]" />
              <div className="landing-preview-window relative overflow-hidden rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-violet-300" />
                    一次活动的共同上下文
                  </div>
                  <span className="landing-status-pill rounded-full px-2.5 py-1 text-[10px]">
                    OneFlow 1.0
                  </span>
                </div>
                <div className="mt-5 space-y-3">
                  <div className="landing-flow-node rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                      <Target className="h-4 w-4 text-amber-200" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          活动目标
                        </p>
                        <p className="mt-1 text-sm">
                          面向谁、解决什么、希望用户完成什么
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex justify-center text-violet-300"
                    aria-hidden="true"
                  >
                    <ArrowRight className="h-4 w-4 rotate-90" />
                  </div>
                  <div className="landing-flow-node landing-flow-node-ai rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                      <Bot className="h-4 w-4 text-cyan-200" />
                      <div>
                        <p className="text-xs text-cyan-200">AI 整合上下文</p>
                        <p className="mt-1 text-sm">
                          匹配能力、整理方案、生成可交互原型
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex justify-center text-violet-300"
                    aria-hidden="true"
                  >
                    <ArrowRight className="h-4 w-4 rotate-90" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {["配置清单", "资源要求", "真实预览"].map((item) => (
                      <div
                        key={item}
                        className="landing-flow-output rounded-lg border px-3 py-3 text-center text-xs"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section
          className="landing-section landing-section-muted border-b border-white/[0.08] px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          aria-labelledby="background-title"
        >
          <div className="landing-container mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-amber-200">业务背景</p>
              <h2
                id="background-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                真正消耗团队的，不只是页面制作
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                活动系统已经具备稳定能力，但从业务目标到可上线页面之间，仍有大量解释、查找、确认和返工。
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {painPoints.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="landing-story-card rounded-2xl border p-6"
                >
                  <Icon className="h-5 w-5 text-amber-200" />
                  <h3 className="mt-8 text-lg font-medium">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-section px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          id="current"
          aria-labelledby="current-title"
        >
          <div className="landing-container mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
              <div className="max-w-xl">
                <span className="landing-status-pill inline-flex rounded-full px-3 py-1 text-xs">
                  当前能力 · OneFlow 1.0
                </span>
                <h2
                  id="current-title"
                  className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  让 AI 先成为理解业务的协作管家
                </h2>
                <p className="mt-5 text-base leading-7 text-muted-foreground">
                  它不是一个只回答问题的聊天入口，而是把分散信息组织成团队可以共同查看、修改和验证的项目结果。
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  如果把活动系统比作承载业务的酒店，OneFlow 1.0
                  就是理解房间能力、装修规则和历史经验的 AI
                  管家，先帮助团队找到正确的房间与交付路径。
                </p>
              </div>
              <div className="grid gap-4">
                {currentCapabilities.map(
                  ({ icon: Icon, title, description }, index) => (
                    <article
                      key={title}
                      className="landing-capability-row grid gap-4 rounded-2xl border p-5 sm:grid-cols-[auto_1fr] sm:items-start"
                    >
                      <div className="landing-feature-icon flex h-11 w-11 items-center justify-center rounded-xl border bg-gradient-to-br from-violet-500/15 to-violet-500/0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-mono text-[11px] text-cyan-300">
                          0{index + 1}
                        </p>
                        <h3 className="mt-2 text-lg font-medium">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {description}
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          className="landing-section landing-section-muted border-y border-white/[0.08] px-4 py-20 sm:px-6 lg:px-8 lg:py-24"
          aria-labelledby="boundary-title"
        >
          <div className="landing-container mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-cyan-300">
                清晰的产品边界
              </p>
              <h2
                id="boundary-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                OneFlow 串联交付，不替代业务系统
              </h2>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <div className="landing-boundary-card rounded-2xl border p-6">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <p className="mt-6 text-sm font-medium text-emerald-100">
                  活动系统
                </p>
                <h3 className="mt-2 text-xl font-medium">承载业务事实</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  负责活动规则、参与状态、权限和真实线上运行。
                </p>
              </div>
              <div className="landing-boundary-card landing-boundary-card-primary rounded-2xl border p-6">
                <Sparkles className="h-5 w-5 text-violet-200" />
                <p className="mt-6 text-sm font-medium text-violet-100">
                  OneFlow 创作端
                </p>
                <h3 className="mt-2 text-xl font-medium">组织协作交付</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  负责目标、页面、配置、资源、预览、版本与团队协作。
                </p>
              </div>
              <div className="landing-boundary-card rounded-2xl border p-6">
                <Eye className="h-5 w-5 text-cyan-200" />
                <p className="mt-6 text-sm font-medium text-cyan-100">
                  FlowSite 使用端
                </p>
                <h3 className="mt-2 text-xl font-medium">消费发布结果</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  负责浏览和使用已经验证、发布的页面结果。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="landing-section px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <div className="landing-container mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-violet-300">
                从目标到复用
              </p>
              <h2
                id="workflow-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                一场活动，在同一条链路里完成
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                AI
                承接可规则化的整理与执行，人继续负责目标、专业标准、复杂例外和最终验收。
              </p>
            </div>
            <ol className="landing-workflow-grid mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workflow.map(([number, title, description, Icon]) => (
                <li
                  key={number}
                  className="landing-workflow-card rounded-2xl border p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-cyan-300">
                      {number}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="mt-8 text-lg font-medium">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="landing-section landing-section-muted border-y border-white/[0.08] px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          aria-labelledby="value-title"
        >
          <div className="landing-container mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-emerald-300">管理价值</p>
              <h2
                id="value-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                不只完成一次活动，更要改变下一次的起点
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                OneFlow
                的价值不是替团队做一个页面，而是让活动交付逐步成为可理解、可验证、可复用的组织能力。
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {managementValues.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="landing-value-card rounded-2xl border p-5"
                >
                  <Icon className="h-5 w-5 text-emerald-300" />
                  <h3 className="mt-8 text-lg font-medium">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-section px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
          id="roadmap"
          aria-labelledby="roadmap-title"
        >
          <div className="landing-container mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-amber-200">现在与未来</p>
              <h2
                id="roadmap-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                从理解与规划，走向生成与施工
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                路线不是让 AI
                绕过专业判断直接上线，而是逐步扩大它能安全承接的执行范围。
              </p>
            </div>

            <div className="landing-roadmap mt-12 grid gap-5 lg:grid-cols-2">
              <article
                className="landing-roadmap-card landing-roadmap-card-current rounded-3xl border p-6 sm:p-8"
                aria-labelledby="roadmap-current-title"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="landing-status-pill rounded-full px-3 py-1 text-xs">
                    当前能力
                  </span>
                  <Bot className="h-5 w-5 text-cyan-200" />
                </div>
                <p className="mt-8 text-sm font-medium text-cyan-200">
                  OneFlow 1.0 · AI 管家
                </p>
                <h3
                  id="roadmap-current-title"
                  className="mt-2 text-2xl font-semibold"
                >
                  理解业务，组织交付
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  理解活动目标与既有能力，生成方案、可交互原型、配置清单和资源要求，帮助团队更早进入真实页面协作。
                </p>
                <ul className="mt-7 space-y-3 text-sm text-muted-foreground">
                  {[
                    "结合产品能力与项目知识",
                    "组织页面、配置、资源和预览",
                    "保留人工修改、协作和验收",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 border-t border-white/10 pt-5">
                  <p className="text-sm font-medium text-cyan-100">
                    先解决“知道怎么做、一起做对”
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    当前仍需要团队制作与调整资源、补充复杂业务能力，并完成上线接入。OneFlow
                    让这些工作共享明确的目标、规则和页面上下文，而不是在不同工具间重新解释。
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    试点先验证三件事：原型是否可用，预览是否提前发现问题，规范与经验能否在下一次活动中复用。
                  </p>
                </div>
              </article>

              <article
                className="landing-roadmap-card landing-roadmap-card-future rounded-3xl border p-6 sm:p-8"
                aria-labelledby="roadmap-future-title"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="landing-future-pill rounded-full px-3 py-1 text-xs">
                    未来方向 · 建设中
                  </span>
                  <HardHat className="h-5 w-5 text-amber-200" />
                </div>
                <p className="mt-8 text-sm font-medium text-amber-200">
                  OneFlow 2.0 · AI 装修队
                </p>
                <h3
                  id="roadmap-future-title"
                  className="mt-2 text-2xl font-semibold"
                >
                  生成页面，执行施工
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  未来 AI
                  将进一步生成页面代码、视觉素材和交互结果，让团队直接检查可运行页面，而不是接收一份等待人工施工的方案。
                </p>
                <ul className="mt-7 space-y-3 text-sm text-muted-foreground">
                  {[
                    "AI 生成并持续迭代页面与素材",
                    "Headless 引擎守住规则、权限与业务事实",
                    "通过系统校验和人工验收后再进入真实环境",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 border-t border-white/10 pt-5">
                  <p className="text-sm font-medium text-amber-100">
                    让逻辑稳定，让页面自由
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Headless 将活动逻辑与页面外观解耦。未来，OneFlow
                    生成的页面包需经引擎校验，再受控部署、激活或回滚；页面可以持续创新，业务规则仍有清晰边界。
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    这将把团队从重复制作与固定模板换皮中释放出来：策划聚焦目标，设计把关审美，产品与开发建设规则和底座，AI
                    执行生成与修改。
                  </p>
                </div>
              </article>
            </div>

            <div className="landing-roadmap-guard mt-5 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center">
              <ShieldCheck className="h-6 w-6 shrink-0 text-violet-200" />
              <div>
                <p className="text-sm font-medium">始终不变的边界</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  人负责目标、标准、审美、例外和最终判断；AI
                  承接可规则化的执行，但不能绕过业务规则、权限、系统校验和人工验收。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6 lg:px-8 lg:pb-32">
          <div className="landing-cta relative mx-auto max-w-5xl overflow-hidden rounded-3xl border px-6 py-14 text-center sm:px-12">
            <div className="landing-cta-halo pointer-events-none absolute inset-0" />
            <div className="relative">
              <p className="text-sm font-medium text-violet-200">
                从真实业务开始
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                选择一个真实活动，跑通第一条 OneFlow 工作流
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                用一次范围清晰的活动验证从目标、原型、资源预览到人工验收的完整链路，再把有效的方法沉淀给下一次。
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="landing-primary-button group gap-2"
                >
                  <Link href="/workbench">
                    进入工作台{" "}
                    <ArrowRight className="landing-cta-arrow h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="landing-secondary-button border-white/15"
                >
                  <Link href="/manual">阅读用户手册</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
