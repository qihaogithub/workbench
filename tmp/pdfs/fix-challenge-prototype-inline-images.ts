import fs from "node:fs";
import path from "node:path";

import { ProjectAdminService } from "../../packages/project-core/src/service.js";
import type { ProjectAdminActor } from "../../packages/project-core/src/types.js";

const projectId = "proj_1782839405716_tqjl1f";

const actor: ProjectAdminActor = {
  id: process.env.USER ?? "local-codex",
  name: process.env.USER ?? "Local Codex",
  role: "admin",
  source: "project-admin-inline-image-fix",
};

function assertOk<T>(label: string, result: { ok: boolean; data?: T; error?: unknown }): T {
  if (!result.ok || result.data === undefined) {
    throw new Error(`${label} failed: ${JSON.stringify(result, null, 2)}`);
  }
  return result.data;
}

function readPngSize(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function pageCode(title: string, dataUrl: string, width: number, height: number): string {
  return `interface PrototypePageProps {
  title?: string;
}

const PROTOTYPE_IMAGE_SRC = ${JSON.stringify(dataUrl)};

export default function PrototypePage({ title = ${JSON.stringify(title)} }: PrototypePageProps) {
  return (
    <main className="min-h-screen w-full bg-[#f3f4f6] px-4 py-6 text-[#111827]">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[${Math.min(Math.max(width, 375), 760)}px] flex-col items-center justify-center gap-3">
        <h1 className="w-full text-left text-sm font-medium text-[#374151]">{title}</h1>
        <div className="w-full overflow-hidden rounded-[8px] bg-white shadow-sm ring-1 ring-black/10">
          <img
            src={PROTOTYPE_IMAGE_SRC}
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

const service = new ProjectAdminService();
const edit = assertOk("edit begin", service.beginEdit(projectId, actor));
const pages = assertOk("page list", service.listPages(edit.editId)).pages;
const updated = [];

for (const page of pages) {
  const match = /^prototype-(\d{2})$/.exec(page.id);
  if (!match) continue;

  const pageNumber = match[1];
  const title = page.name.replace(/^\d{2}\s+/, "");
  const imagePath = path.resolve(
    `data/projects/${projectId}/workspace/assets/images/challenge-prototype/page-${pageNumber}.png`,
  );
  const { width, height } = readPngSize(imagePath);
  const dataUrl = `data:image/png;base64,${fs.readFileSync(imagePath).toString("base64")}`;
  const detail = assertOk("page get", service.getPage(edit.editId, page.id));
  const result = assertOk("page update", service.updatePage({
    editId: edit.editId,
    pageId: page.id,
    code: pageCode(title, dataUrl, width, height),
    schema: detail.files.schema,
  }, actor));
  updated.push({ pageId: result.meta.id, title, width, height });
}

const validation = assertOk("edit validate", service.editValidate(edit.editId));
if (!validation.ok) {
  throw new Error(`validation failed: ${JSON.stringify(validation, null, 2)}`);
}

const diff = assertOk("edit diff", service.editDiff(edit.editId));
const committed = assertOk("edit commit", service.commitEdit(
  edit.editId,
  "修复闯关活动原型页图片预览路径",
  actor,
));

const output = {
  projectId,
  editId: edit.editId,
  versionId: committed.version.versionId,
  updatedCount: updated.length,
  updated,
  validation,
  diff,
};

fs.writeFileSync(
  path.resolve("tmp/pdfs/challenge-inline-fix-result.json"),
  JSON.stringify(output, null, 2),
  "utf-8",
);

console.log(JSON.stringify(output, null, 2));
