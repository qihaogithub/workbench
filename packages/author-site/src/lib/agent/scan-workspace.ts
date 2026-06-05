import * as fs from "fs";
import * as path from "path";
import type { SystemPromptContext } from "./system-prompt";
import { listDemoPages } from "../fs-utils";

const MAX_INLINE_PAGES = 2;

interface PageInfo {
  id: string;
  name: string;
  indexPath: string;
  schemaPath: string;
  indexContent?: string;
  schemaContent?: string;
}

function readPageFiles(workingDir: string, page: PageInfo): PageInfo {
  try {
    page.indexContent = fs.readFileSync(
      path.join(workingDir, page.indexPath),
      "utf-8",
    );
  } catch {
    /* 读取失败保持 undefined */
  }
  try {
    page.schemaContent = fs.readFileSync(
      path.join(workingDir, page.schemaPath),
      "utf-8",
    );
  } catch {
    /* 读取失败保持 undefined */
  }
  return page;
}

function formatPageList(pages: PageInfo[]): string {
  if (pages.length === 0) return "（暂无页面）";

  return pages
    .map((p) => {
      const lines = [
        `- ${p.name}`,
        `  - index.tsx: \`${p.indexPath}\``,
        `  - config.schema.json: \`${p.schemaPath}\``,
      ];
      if (p.indexContent !== undefined) {
        lines.push("  - 代码内容：");
        lines.push(
          p.indexContent
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );
      }
      if (p.schemaContent !== undefined) {
        lines.push("  - 配置内容：");
        lines.push(
          p.schemaContent
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function scanWorkspaceContext(workingDir: string): SystemPromptContext {
  const pages: PageInfo[] = [];

  // 使用 listDemoPages 读取页面列表（自动处理 workspace-tree.json 迁移和磁盘发现）
  const demoPages = listDemoPages(workingDir);
  for (const p of demoPages) {
    pages.push({
      id: p.id,
      name: p.name,
      indexPath: path.join("demos", p.id, "index.tsx"),
      schemaPath: path.join("demos", p.id, "config.schema.json"),
    });
  }

  // 页面数 ≤ 2 时直接读文件内容嵌入 L3（> 2 时全部不嵌入，避免 L3 过大）
  if (pages.length > 0 && pages.length <= MAX_INLINE_PAGES) {
    for (const page of pages) {
      readPageFiles(workingDir, page);
    }
  }

  const hasProjectConfig = fs.existsSync(
    path.join(workingDir, "project.config.schema.json"),
  );

  const pageList = formatPageList(pages);

  const projectName = path.basename(workingDir);

  return {
    projectName,
    projectConfigStatus: hasProjectConfig ? "已设置" : "未设置",
    pageCount: pages.length,
    pageList,
    workspacePath: workingDir,
  };
}

/**
 * 读取工作区根目录的 memory.md 内容
 * 容错：文件不存在或读取失败时返回 null
 */
export function readMemoryContent(workingDir: string): string | null {
  const memoryPath = path.join(workingDir, "memory.md");
  try {
    if (!fs.existsSync(memoryPath)) {
      return null;
    }
    const content = fs.readFileSync(memoryPath, "utf-8").trim();
    if (!content) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * 扫描知识库索引（读取 knowledge/manifest.json 并格式化为索引文本）
 * 容错：manifest.json 不存在或解析失败时返回 null
 */
export function scanKnowledgeIndex(workingDir: string): string | null {
  const manifestPath = path.join(workingDir, "knowledge", "manifest.json");
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);
    if (!manifest.items || manifest.items.length === 0) return null;
    const lines = manifest.items.map(
      (item: { title: string; description: string; fileName: string }) =>
        `- ${item.title}：${item.description}（knowledge/${item.fileName}）`
    );
    return `项目知识库（共 ${manifest.items.length} 篇）：\n${lines.join("\n")}\n→ 需要查阅时请用 readFile 读取对应文件`;
  } catch {
    return null;
  }
}

/**
 * 将旧项目的 references/ 目录迁移到 knowledge/ 目录
 * 仅在 references/ 存在且 knowledge/ 不存在时执行，迁移后删除旧目录
 */
export function migrateReferencesToKnowledge(workingDir: string): void {
  const referencesDir = path.join(workingDir, "references");
  const knowledgeDir = path.join(workingDir, "knowledge");

  // 仅在 references/ 存在且 knowledge/ 不存在时迁移
  if (!fs.existsSync(referencesDir) || fs.existsSync(knowledgeDir)) return;

  fs.mkdirSync(knowledgeDir, { recursive: true });

  // 读取 references/ 下所有 .md 文件
  const files = fs.readdirSync(referencesDir).filter(f => f.endsWith(".md"));
  const items = files.map((file, index) => {
    const title = file.replace(/\.md$/, "");
    // 复制文件到 knowledge/
    fs.copyFileSync(
      path.join(referencesDir, file),
      path.join(knowledgeDir, file)
    );
    return {
      id: `kb_sys_${String(index + 1).padStart(3, "0")}`,
      title,
      source: "system",
      description: "系统预设参考文档",
      fileName: file,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // 写入 manifest.json
  if (items.length > 0) {
    fs.writeFileSync(
      path.join(knowledgeDir, "manifest.json"),
      JSON.stringify({ version: 1, items }, null, 2),
      "utf-8"
    );
  }

  // 删除旧 references/ 目录
  fs.rmSync(referencesDir, { recursive: true });
}
