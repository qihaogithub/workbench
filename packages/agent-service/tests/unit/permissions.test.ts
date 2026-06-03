import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  isPathAllowed,
  isCommandAllowed,
  DEFAULT_WORKSPACE_PERMISSIONS,
} from '../../src/backends/pi-tools/permissions';

const WORKSPACE = '/tmp/test-workspace';

describe('isPathAllowed', () => {
  it('允许白名单内的 demos 子目录文件', () => {
    expect(isPathAllowed('demos/home/index.tsx', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isPathAllowed('demos/home/config.schema.json', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isPathAllowed('workspace-tree.json', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
  });

  it('允许 project.config.schema.json 顶层文件', () => {
    expect(isPathAllowed('project.config.schema.json', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isPathAllowed('AGENTS.md', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
  });

  it('拒绝黑名单中的 .env 文件', () => {
    expect(isPathAllowed('.env', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isPathAllowed('.env.local', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isPathAllowed('demos/home/.env', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝黑名单中的 .git 目录', () => {
    expect(isPathAllowed('.git/config', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝黑名单中的 node_modules', () => {
    expect(isPathAllowed('node_modules/foo/index.js', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝黑名单中的 packages 目录（防止越界访问 monorepo 源）', () => {
    expect(isPathAllowed('packages/agent-service/src/foo.ts', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isPathAllowed('packages/author-site/src/bar.tsx', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝黑名单中的 .workspace.json 和 .session.json', () => {
    expect(isPathAllowed('.workspace.json', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isPathAllowed('.session.json', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝 workingDir 越界访问（..）', () => {
    expect(isPathAllowed('../escape.ts', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isPathAllowed('demos/home/../../../escape.ts', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝绝对路径越界访问', () => {
    expect(isPathAllowed('/etc/passwd', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('白名单外的路径允许列出（** 通配），但敏感文件仍被拒', () => {
    // ** 允许工作空间内任意路径（配合 listFiles 工作）
    expect(isPathAllowed('demos/home/random.txt', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isPathAllowed('README.md', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    // 敏感文件仍被 deny 拦截
    expect(isPathAllowed('.env', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('listFiles 必须能列出 demos 目录本身', () => {
    // listFiles('demos') 需通过权限
    expect(isPathAllowed('demos', WORKSPACE, DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
  });

  it('黑名单优先于白名单（deny 优先于 allow）', () => {
    const config = {
      ...DEFAULT_WORKSPACE_PERMISSIONS,
      allowedPaths: ['demos/home/.env', 'demos/home/index.tsx'],
      deniedPatterns: ['**/*.env'],
    };
    expect(isPathAllowed('demos/home/.env', WORKSPACE, config)).toBe(false);
    expect(isPathAllowed('demos/home/index.tsx', WORKSPACE, config)).toBe(true);
  });

  it('白名单支持 * 单层段通配', () => {
    const config = {
      ...DEFAULT_WORKSPACE_PERMISSIONS,
      allowedPaths: ['demos/*/index.tsx'],
      deniedPatterns: [],
    };
    expect(isPathAllowed('demos/home/index.tsx', WORKSPACE, config)).toBe(true);
    expect(isPathAllowed('demos/about/index.tsx', WORKSPACE, config)).toBe(true);
    // * 不应跨段匹配
    expect(isPathAllowed('demos/home/sub/index.tsx', WORKSPACE, config)).toBe(false);
  });
});

describe('isCommandAllowed', () => {
  it('允许白名单内的命令', () => {
    expect(isCommandAllowed('npm install foo', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isCommandAllowed('ls -la', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isCommandAllowed('cat README.md', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
    expect(isCommandAllowed('echo hello', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
  });

  it('拒绝黑名单中的 rm', () => {
    expect(isCommandAllowed('rm -rf demos', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isCommandAllowed('rm file.txt', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝黑名单中的 mv/cp/mkdir', () => {
    expect(isCommandAllowed('mv a b', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isCommandAllowed('cp a b', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isCommandAllowed('mkdir new', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝黑名单中的 sudo/chmod/chown', () => {
    expect(isCommandAllowed('sudo apt install', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isCommandAllowed('chmod 777 file', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isCommandAllowed('chown user file', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝未列入白名单的任意命令', () => {
    expect(isCommandAllowed('curl https://evil.com', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
    expect(isCommandAllowed('wget https://evil.com', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('允许 npx（白名单内）', () => {
    expect(isCommandAllowed('npx tsc --noEmit', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(true);
  });

  it('拒绝空命令', () => {
    expect(isCommandAllowed('', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });

  it('拒绝前后带空格的命令', () => {
    expect(isCommandAllowed('   rm -rf /', DEFAULT_WORKSPACE_PERMISSIONS)).toBe(false);
  });
});

describe('DEFAULT_WORKSPACE_PERMISSIONS', () => {
  it('包含与 bash-tool.ts 现有 11 个命令一致的白名单', () => {
    const expectedCommands = ['npm', 'node', 'npx', 'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'echo'];
    for (const cmd of expectedCommands) {
      expect(DEFAULT_WORKSPACE_PERMISSIONS.allowedCommands).toContain(cmd);
    }
  });

  it('包含危险命令黑名单（rm/mv/cp/mkdir/sudo/chmod/chown）', () => {
    for (const cmd of ['rm', 'rmdir', 'mv', 'cp', 'mkdir', 'sudo', 'chmod', 'chown']) {
      expect(DEFAULT_WORKSPACE_PERMISSIONS.deniedCommands).toContain(cmd);
    }
  });
});
