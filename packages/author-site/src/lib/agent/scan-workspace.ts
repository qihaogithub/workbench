import * as fs from 'fs';
import * as path from 'path';
import type { SystemPromptContext } from './system-prompt';

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
    page.indexContent = fs.readFileSync(path.join(workingDir, page.indexPath), 'utf-8');
  } catch {
    /* 读取失败保持 undefined */
  }
  try {
    page.schemaContent = fs.readFileSync(path.join(workingDir, page.schemaPath), 'utf-8');
  } catch {
    /* 读取失败保持 undefined */
  }
  return page;
}

function formatPageList(pages: PageInfo[]): string {
  if (pages.length === 0) return '（暂无页面）';

  return pages
    .map((p) => {
      const lines = [
        `- ${p.name}`,
        `  - index.tsx: \`${p.indexPath}\``,
        `  - config.schema.json: \`${p.schemaPath}\``,
      ];
      if (p.indexContent !== undefined) {
        lines.push('  - 代码内容：');
        lines.push(p.indexContent.split('\n').map((l) => `    ${l}`).join('\n'));
      }
      if (p.schemaContent !== undefined) {
        lines.push('  - 配置内容：');
        lines.push(p.schemaContent.split('\n').map((l) => `    ${l}`).join('\n'));
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

export function scanWorkspaceContext(workingDir: string): SystemPromptContext {
  const pages: PageInfo[] = [];

  // 优先从 workspace-tree.json 读取页面元数据
  const treePath = path.join(workingDir, 'workspace-tree.json');
  if (fs.existsSync(treePath)) {
    try {
      const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
      const treePages = Array.isArray(tree?.pages) ? tree.pages : [];
      for (const p of treePages) {
        pages.push({
          id: p.id || '',
          name: p.name || p.id || '',
          indexPath: path.join('demos', p.id, 'index.tsx'),
          schemaPath: path.join('demos', p.id, 'config.schema.json'),
        });
      }
    } catch { /* fall through to directory scan */ }
  }

  // 兜底：扫描 demos/ 目录（tree 不存在或损坏时）
  if (pages.length === 0) {
    const demosDir = path.join(workingDir, 'demos');
    if (fs.existsSync(demosDir)) {
      for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          pages.push({
            id: entry.name,
            name: entry.name,
            indexPath: path.join('demos', entry.name, 'index.tsx'),
            schemaPath: path.join('demos', entry.name, 'config.schema.json'),
          });
        }
      }
    }
  }

  // 页面数 ≤ 2 时直接读文件内容嵌入 L3（> 2 时全部不嵌入，避免 L3 过大）
  if (pages.length > 0 && pages.length <= MAX_INLINE_PAGES) {
    for (const page of pages) {
      readPageFiles(workingDir, page);
    }
  }

  const hasProjectConfig = fs.existsSync(path.join(workingDir, 'project.config.schema.json'));

  const pageList = formatPageList(pages);

  const projectName = path.basename(workingDir);

  return {
    projectName,
    projectConfigStatus: hasProjectConfig ? '已设置' : '未设置',
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
  const memoryPath = path.join(workingDir, 'memory.md');
  try {
    if (!fs.existsSync(memoryPath)) {
      return null;
    }
    const content = fs.readFileSync(memoryPath, 'utf-8').trim();
    if (!content) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}
