import quickStart from "./quick-start.md";
import workspaceBasics from "./workspace-basics.md";
import projectsAndPages from "./projects-and-pages.md";
import aiCreation from "./ai-creation.md";
import configAndPreview from "./config-and-preview.md";
import collaborationAndVersioning from "./collaboration-and-versioning.md";
import templatesAndKnowledge from "./templates-and-knowledge.md";
import publishShareEmbed from "./publish-share-embed.md";
import figmaAndCli from "./figma-and-cli.md";
import adminAndModels from "./admin-and-models.md";
import troubleshooting from "./troubleshooting.md";
import faq from "./faq.md";

export type ManualSection =
  | "开始使用"
  | "项目创作"
  | "配置与预览"
  | "协同与版本"
  | "模板与知识库"
  | "发布与集成"
  | "管理员"
  | "排障";

export interface ManualArticleMeta {
  slug: string;
  title: string;
  description: string;
  section: ManualSection;
  order: number;
  updatedAt: string;
  tags: readonly string[];
  content: string;
}

export type ManualArticleSummary = Omit<ManualArticleMeta, "content">;

export const MANUAL_VERSION = "v1.0";

export const MANUAL_ARTICLES: readonly ManualArticleMeta[] = [
  {
    slug: "quick-start",
    title: "5 分钟开始使用 OneFlow",
    description: "从登录、创建项目到第一次预览，完成 OneFlow 的最短上手路径。",
    section: "开始使用",
    order: 10,
    updatedAt: "2026-09-02",
    tags: ["入门", "创建项目", "预览"],
    content: quickStart,
  },
  {
    slug: "workspace-basics",
    title: "认识工作台",
    description: "了解项目列表、页面树、编辑区、配置栏和预览区各自负责什么。",
    section: "开始使用",
    order: 20,
    updatedAt: "2026-09-02",
    tags: ["工作台", "界面", "导航"],
    content: workspaceBasics,
  },
  {
    slug: "projects-and-pages",
    title: "项目与页面管理",
    description: "学习项目、页面、文件夹、模板和回收站的日常管理方式。",
    section: "项目创作",
    order: 30,
    updatedAt: "2026-09-02",
    tags: ["项目", "页面", "模板", "回收站"],
    content: projectsAndPages,
  },
  {
    slug: "ai-creation",
    title: "使用 AI 创作页面",
    description: "掌握如何向 AI 描述目标、审阅变更并让结果回到当前工作区。",
    section: "项目创作",
    order: 40,
    updatedAt: "2026-09-02",
    tags: ["AI", "对话", "代码", "页面"],
    content: aiCreation,
  },
  {
    slug: "config-and-preview",
    title: "配置与实时预览",
    description: "了解 Schema、项目级配置、页面级配置和预览联动。",
    section: "配置与预览",
    order: 50,
    updatedAt: "2026-09-02",
    tags: ["Schema", "配置", "预览", "运行时"],
    content: configAndPreview,
  },
  {
    slug: "collaboration-and-versioning",
    title: "协同编辑与版本管理",
    description: "理解自动保存、协作者状态、检查点和版本恢复。",
    section: "协同与版本",
    order: 60,
    updatedAt: "2026-09-02",
    tags: ["协同", "自动保存", "版本", "恢复"],
    content: collaborationAndVersioning,
  },
  {
    slug: "templates-and-knowledge",
    title: "模板、知识库与资料",
    description: "使用模板快速复用项目，并让知识库为 AI 提供可靠上下文。",
    section: "模板与知识库",
    order: 70,
    updatedAt: "2026-09-02",
    tags: ["模板", "知识库", "文档", "复用"],
    content: templatesAndKnowledge,
  },
  {
    slug: "publish-share-embed",
    title: "发布、分享与嵌入",
    description: "从工作区生成发布结果，并通过浏览端、分享链接或 iframe 使用。",
    section: "发布与集成",
    order: 80,
    updatedAt: "2026-09-02",
    tags: ["发布", "分享", "嵌入", "FlowSite"],
    content: publishShareEmbed,
  },
  {
    slug: "figma-and-cli",
    title: "Figma 插件与 CLI",
    description: "了解设计导入和 Project Admin CLI 的适用场景与基本流程。",
    section: "发布与集成",
    order: 90,
    updatedAt: "2026-09-02",
    tags: ["Figma", "CLI", "导入", "开发者"],
    content: figmaAndCli,
  },
  {
    slug: "admin-and-models",
    title: "管理员与模型配置",
    description: "管理员如何管理用户、模型可见性和 AI 供应商配置。",
    section: "管理员",
    order: 100,
    updatedAt: "2026-09-02",
    tags: ["管理员", "模型", "供应商", "权限"],
    content: adminAndModels,
  },
  {
    slug: "troubleshooting",
    title: "常见问题排查",
    description: "遇到登录、预览、保存或 AI 响应问题时，按现象快速定位。",
    section: "排障",
    order: 110,
    updatedAt: "2026-09-02",
    tags: ["排障", "错误", "预览", "保存"],
    content: troubleshooting,
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "集中回答账号、模型、项目数据和发布使用中的高频问题。",
    section: "排障",
    order: 120,
    updatedAt: "2026-09-02",
    tags: ["FAQ", "账号", "模型", "数据"],
    content: faq,
  },
];

const articleBySlug = new Map(MANUAL_ARTICLES.map((article) => [article.slug, article]));

export function validateManualManifest(
  articles: readonly ManualArticleMeta[] = MANUAL_ARTICLES,
): void {
  const slugs = new Set<string>();
  const orders = new Set<number>();
  for (const article of articles) {
    if (!article.slug.trim() || slugs.has(article.slug)) {
      throw new Error(`Duplicate or empty manual article slug: ${article.slug}`);
    }
    if (!article.title.trim() || !article.description.trim() || !article.updatedAt.trim()) {
      throw new Error(`Incomplete manual metadata: ${article.slug}`);
    }
    if (!Number.isInteger(article.order) || article.order < 0 || orders.has(article.order)) {
      throw new Error(`Invalid or duplicate manual article order: ${article.slug}`);
    }
    slugs.add(article.slug);
    orders.add(article.order);
  }

  for (const article of articles) {
    for (const match of article.content.matchAll(/\]\((\/manual\/([^)#?]+))/g)) {
      if (!slugs.has(match[2])) {
        throw new Error(`Unknown manual article link in ${article.slug}: ${match[1]}`);
      }
    }
  }
}

validateManualManifest();

export function getManualArticle(slug: string): ManualArticleMeta | undefined {
  return articleBySlug.get(slug);
}

export function getManualSections(): Array<{ section: ManualSection; articles: ManualArticleSummary[] }> {
  const groups = new Map<ManualSection, ManualArticleSummary[]>();
  for (const article of MANUAL_ARTICLES) {
    const { content: _content, ...summary } = article;
    const articles = groups.get(article.section) ?? [];
    articles.push(summary);
    groups.set(article.section, articles);
  }
  return Array.from(groups.entries()).map(([section, articles]) => ({
    section,
    articles: articles.sort((a, b) => a.order - b.order),
  }));
}
