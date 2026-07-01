import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectId = 'proj_1782839405716_tqjl1f';
const projectWorkspace = path.resolve('data/projects', projectId, 'workspace');
const sessionWorkspace = path.resolve(
  'data/workspaces/a5862615-26bb-4688-924d-7fd68c132e21',
  projectId,
  'ws-1782863019233-xvvc4hen0',
);
const reportPath = path.resolve('tmp/pdfs/challenge-session-code-sync-result.json');

const copied = [];
const skipped = [];

for (let index = 1; index <= 27; index += 1) {
  const pageId = `prototype-${String(index).padStart(2, '0')}`;
  const sourcePageDir = path.join(projectWorkspace, 'demos', pageId);
  const targetPageDir = path.join(sessionWorkspace, 'demos', pageId);
  const sourceIndex = path.join(sourcePageDir, 'index.tsx');
  const targetIndex = path.join(targetPageDir, 'index.tsx');
  const [source, target] = await Promise.all([
    readFile(sourceIndex, 'utf8'),
    readFile(targetIndex, 'utf8'),
  ]);

  if (!source.includes('代码化还原') || !source.includes('export default function ChallengePrototypePage')) {
    throw new Error(`Source page ${pageId} is not the expected code-reconstructed version`);
  }

  if (source === target) {
    skipped.push({ pageId, reason: 'same-as-project' });
    continue;
  }

  const targetLooksLikeScreenshot =
    target.includes('PROTOTYPE_IMAGE_SRC') ||
    target.includes('data:image') ||
    target.includes('<img') ||
    target.includes('challenge-prototype');

  await writeFile(targetIndex, source);
  await copyFile(path.join(sourcePageDir, 'config.schema.json'), path.join(targetPageDir, 'config.schema.json'));
  copied.push({
    pageId,
    file: path.relative(process.cwd(), targetIndex),
    reason: targetLooksLikeScreenshot ? 'replace-screenshot' : 'sync-newer-code',
  });
}

const syncedFiles = [];
for (const fileName of ['workspace-tree.json', '.canvas-layout.json', 'app.graph.json', 'memory.md']) {
  await copyFile(path.join(projectWorkspace, fileName), path.join(sessionWorkspace, fileName));
  syncedFiles.push(fileName);
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  JSON.stringify(
    {
      projectId,
      sessionWorkspace: path.relative(process.cwd(), sessionWorkspace),
      projectWorkspace: path.relative(process.cwd(), projectWorkspace),
      copiedCount: copied.length,
      skippedCount: skipped.length,
      copied,
      skipped,
      syncedFiles,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ copiedCount: copied.length, skippedCount: skipped.length, reportPath }, null, 2));
