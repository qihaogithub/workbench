import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { transform } from 'sucrase';

const sourceDir = path.resolve('tmp/pdfs/challenge-code-pages');
const outDir = path.resolve('tmp/pdfs/challenge-runtime-pages');
const editId = process.argv[2] ?? '';
const shouldUpdate = Boolean(editId);

await mkdir(outDir, { recursive: true });

const generated = [];
for (let index = 1; index <= 27; index += 1) {
  const pageId = `prototype-${String(index).padStart(2, '0')}`;
  const sourceFile = path.join(sourceDir, `${pageId}.tsx`);
  const outFile = path.join(outDir, `${pageId}.tsx`);
  const source = await readFile(sourceFile, 'utf8');
  const result = transform(source, {
    transforms: ['typescript', 'jsx'],
    jsxRuntime: 'automatic',
    production: true,
  });
  const code = [
    '// 代码化还原版本：已去除 TypeScript 类型语法，降低创作端预览运行时兼容风险。',
    result.code,
  ].join('\n');
  await writeFile(outFile, code);
  generated.push({ pageId, file: outFile });
}

if (shouldUpdate) {
  for (const item of generated) {
    const result = spawnSync(
      'node',
      ['packages/project-cli/bin/ow.mjs', 'page', 'update-code', editId, item.pageId, '--code', `@${item.file}`, '--json'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`update-code failed for ${item.pageId}: ${result.stderr || result.stdout}`);
    }
  }
}

console.log(JSON.stringify({ generatedCount: generated.length, updated: shouldUpdate, outDir }, null, 2));
