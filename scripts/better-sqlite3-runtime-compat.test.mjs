import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageFiles = [
  'OPS/CLI/package.json',
  'packages/author-site/package.json',
  'packages/knowledge-service/package.json',
  'packages/project-core/package.json',
];

test('all SQLite consumers use the Node 24-compatible N-API addon', () => {
  for (const relativeFile of packageFiles) {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, relativeFile), 'utf8'),
    );
    assert.equal(
      packageJson.dependencies?.['better-sqlite3'],
      '13.0.3',
      `${relativeFile} must pin better-sqlite3 13.0.3`,
    );
  }

  const lockfile = fs.readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  assert.match(lockfile, /better-sqlite3:\n\s+specifier: 13\.0\.3\n\s+version: 13\.0\.3/);
  assert.match(lockfile, /\/better-sqlite3@13\.0\.3:/);
  assert.doesNotMatch(lockfile, /better-sqlite3@12\.11\.1/);
});

test('SQLite addon survives repeated open/prepare/close cycles', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "const Database = require('better-sqlite3'); for (let i = 0; i < 25; i += 1) { const db = new Database(':memory:'); db.exec('create table t(value integer)'); db.prepare('insert into t values (?)').run(i); if (db.prepare('select value from t').get().value !== i) process.exit(2); db.close(); }",
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(
    result.status,
    0,
    `better-sqlite3 child process failed (status=${result.status}, signal=${result.signal}): ${result.stderr}`,
  );
});
