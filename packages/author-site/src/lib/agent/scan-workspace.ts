import * as fs from 'fs';
import * as path from 'path';
import type { SystemPromptContext } from './system-prompt';

export function scanWorkspaceContext(workingDir: string): SystemPromptContext {
  const demosDir = path.join(workingDir, 'demos');
  const pages: Array<{ id: string; name: string }> = [];

  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const demoJsonPath = path.join(demosDir, entry.name, '.demo.json');
        let name = entry.name;
        if (fs.existsSync(demoJsonPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(demoJsonPath, 'utf-8'));
            name = meta.name || entry.name;
          } catch {
            /* 解析失败用目录名 */
          }
        }
        pages.push({ id: entry.name, name });
      }
    }
  }

  const hasProjectConfig = fs.existsSync(path.join(workingDir, 'project.config.schema.json'));

  const pageList = pages.length > 0
    ? pages.map((p, i) => `${i + 1}. **${p.name}** (\`demos/${p.id}/\`)`).join('\n')
    : '（暂无页面）';

  const projectName = path.basename(workingDir);

  return {
    projectName,
    projectConfigStatus: hasProjectConfig ? '已设置' : '未设置',
    pageCount: pages.length,
    pageList,
    workspacePath: workingDir,
  };
}
