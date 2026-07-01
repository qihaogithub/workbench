import fs from "node:fs";
import path from "node:path";

import { ProjectAdminService } from "../../packages/project-core/src/service.js";
import type { ProjectAdminActor } from "../../packages/project-core/src/types.js";

interface PageSpec {
  index: number;
  title: string;
  file: string;
}

const actor: ProjectAdminActor = {
  id: process.env.USER ?? "local-codex",
  name: process.env.USER ?? "Local Codex",
  role: "admin",
  source: "project-admin-import-script",
};

const pages: PageSpec[] = [
  { index: 1, title: "首页弹窗-体验包领取", file: "page-01.png" },
  { index: 2, title: "详情页-活动入口", file: "page-02.png" },
  { index: 3, title: "任务中心-活动入口", file: "page-03.png" },
  { index: 4, title: "成了诗仙李白-首页", file: "page-04.png" },
  { index: 5, title: "视频竖版占位页", file: "page-05.png" },
  { index: 6, title: "端午大作战-启动页", file: "page-06.png" },
  { index: 7, title: "活动规则说明页", file: "page-07.png" },
  { index: 8, title: "关卡任务列表组件页", file: "page-08.png" },
  { index: 9, title: "动物园奇遇记-首页弹窗", file: "page-09.png" },
  { index: 10, title: "任务流程长页A", file: "page-10.png" },
  { index: 11, title: "视频横版占位页", file: "page-11.png" },
  { index: 12, title: "任务流程长页B", file: "page-12.png" },
  { index: 13, title: "任务详情弹窗页", file: "page-13.png" },
  { index: 14, title: "视频播放页", file: "page-14.png" },
  { index: 15, title: "生成作品-拍摄入口", file: "page-15.png" },
  { index: 16, title: "拍摄页-实时预览", file: "page-16.png" },
  { index: 17, title: "作品生成页-进度", file: "page-17.png" },
  { index: 18, title: "拍摄页-确认动作", file: "page-18.png" },
  { index: 19, title: "作品生成页-素材预览", file: "page-19.png" },
  { index: 20, title: "分享视频作品页", file: "page-20.png" },
  { index: 21, title: "作品生成页-键盘态", file: "page-21.png" },
  { index: 22, title: "作品生成页-底部操作", file: "page-22.png" },
  { index: 23, title: "交互弹窗-完成提示", file: "page-23.png" },
  { index: 24, title: "素材选择长页", file: "page-24.png" },
  { index: 25, title: "竞速任务-可参与", file: "page-25.png" },
  { index: 26, title: "竞速任务-已完成", file: "page-26.png" },
  { index: 27, title: "送祝福抽好礼-首页", file: "page-27.png" },
];

function assertOk<T>(label: string, result: { ok: boolean; data?: T; error?: unknown }): T {
  if (!result.ok || result.data === undefined) {
    throw new Error(`${label} failed: ${JSON.stringify(result, null, 2)}`);
  }
  return result.data;
}

function readPngSize(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function routeKey(index: number): string {
  return `prototype-${String(index).padStart(2, "0")}`;
}

function pageCode(title: string, assetPath: string, width: number, height: number): string {
  const imageSrc = `../../${assetPath}`;
  return `interface PrototypePageProps {
  title?: string;
}

export default function PrototypePage({ title = ${JSON.stringify(title)} }: PrototypePageProps) {
  return (
    <main className="min-h-screen w-full bg-[#f3f4f6] px-4 py-6 text-[#111827]">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[${Math.min(Math.max(width, 375), 760)}px] flex-col items-center justify-center gap-3">
        <h1 className="w-full text-left text-sm font-medium text-[#374151]">{title}</h1>
        <div className="w-full overflow-hidden rounded-[8px] bg-white shadow-sm ring-1 ring-black/10">
          <img
            src=${JSON.stringify(imageSrc)}
            alt={title}
            className="block h-auto w-full"
            width={${width}}
            height={${height}}
          />
        </div>
      </section>
    </main>
  );
}
`;
}

function pageSchema(title: string, width: number, height: number): string {
  return JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $demo: {
        previewSize: {
          width: Math.min(Math.max(width, 375), 760),
          height: Math.min(Math.max(height, 667), 1200),
        },
      },
      title: `${title}配置`,
      type: "object",
      properties: {
        title: {
          type: "string",
          title: "页面标题",
          default: title,
        },
      },
    },
    null,
    2,
  );
}

const service = new ProjectAdminService();
const project = assertOk("project create", service.createProject({
  name: "闯关活动",
  category: "营销活动",
  description: "由 /Users/qh2/Downloads/闯关活动.pdf 原型图导入，每个原型画面对应一个创作端页面。",
}, actor));

const edit = assertOk("edit begin", service.beginEdit(project.id, actor));
const pageResults = [];
const baseDir = path.resolve("tmp/pdfs/challenge-pages");

for (const page of pages) {
  const imagePath = path.join(baseDir, page.file);
  const { width, height } = readPngSize(imagePath);
  const targetPath = `assets/images/challenge-prototype/page-${String(page.index).padStart(2, "0")}.png`;
  const upload = assertOk("asset upload", service.uploadAsset({
    editId: edit.editId,
    filename: page.file,
    targetPath,
    dataBase64: fs.readFileSync(imagePath).toString("base64"),
    mimeType: "image/png",
  }, actor));
  const created = assertOk("page create", service.createPage({
    editId: edit.editId,
    pageId: routeKey(page.index),
    routeKey: routeKey(page.index),
    name: `${String(page.index).padStart(2, "0")} ${page.title}`,
    order: page.index,
    code: pageCode(page.title, upload.path, width, height),
    schema: pageSchema(page.title, width, height),
  }, actor));
  pageResults.push({
    index: page.index,
    title: page.title,
    pageId: created.meta.id,
    routeKey: created.meta.routeKey,
    assetPath: upload.path,
    width,
    height,
  });
}

const validation = assertOk("edit validate", service.editValidate(edit.editId));
if (!validation.ok) {
  throw new Error(`validation failed: ${JSON.stringify(validation, null, 2)}`);
}
const diff = assertOk("edit diff", service.editDiff(edit.editId));
const committed = assertOk("edit commit", service.commitEdit(edit.editId, "导入闯关活动 PDF 原型页面", actor));
const detail = assertOk("project get", service.getProject(project.id, actor));

const result = {
  projectId: project.id,
  editId: edit.editId,
  versionId: committed.version.versionId,
  pageCount: pageResults.length,
  pages: pageResults,
  validation,
  diff,
  projectUpdatedAt: detail.project.updatedAt,
};

fs.writeFileSync(
  path.resolve("tmp/pdfs/challenge-import-result.json"),
  JSON.stringify(result, null, 2),
  "utf-8",
);

console.log(JSON.stringify(result, null, 2));
