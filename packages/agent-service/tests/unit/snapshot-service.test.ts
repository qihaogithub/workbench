import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { SnapshotService } from '../../src/session/snapshot-service';

describe('SnapshotService git 命令参数安全性', () => {
  it('能安全处理包含 shell 元字符和换行的文件名', async () => {
    const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-service-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: workingDir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workingDir });
      execFileSync('git', ['config', 'user.name', 'Snapshot Test'], { cwd: workingDir });
      fs.writeFileSync(path.join(workingDir, 'baseline.txt'), 'baseline');
      const shellName = 'tracked;echo-INJECTION.txt';
      fs.writeFileSync(path.join(workingDir, shellName), 'tracked baseline');
      execFileSync('git', ['add', '--', 'baseline.txt', shellName], { cwd: workingDir });
      execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: workingDir });

      const newlineName = 'created\nnewline.txt';
      fs.writeFileSync(path.join(workingDir, shellName), 'tracked changed');
      fs.writeFileSync(path.join(workingDir, newlineName), 'created');

      const service = new SnapshotService();
      const result = await service.compare(workingDir);
      const paths = result.unstaged.map((change) => change.path);
      expect(paths).toContain(shellName);
      expect(paths).toContain(newlineName);
      await expect(service.getBaselineContent(workingDir, shellName)).resolves.toBe('tracked baseline');

      await service.stageFile(workingDir, shellName);
      expect((await service.compare(workingDir)).staged.map((change) => change.path)).toContain(shellName);
      await service.unstageFile(workingDir, shellName);
      await service.discardFile(workingDir, shellName, 'modify');
      expect(fs.readFileSync(path.join(workingDir, shellName), 'utf-8')).toBe('tracked baseline');
      expect(fs.existsSync(path.join(workingDir, 'INJECTION.txt'))).toBe(false);
    } finally {
      fs.rmSync(workingDir, { recursive: true, force: true });
    }
  });

  it('拒绝回滚工作区之外的路径', async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-boundary-'));
    const workingDir = path.join(parentDir, 'workspace');
    const outsidePath = path.join(parentDir, 'outside.txt');
    fs.mkdirSync(workingDir);
    fs.writeFileSync(outsidePath, 'keep');

    try {
      const service = new SnapshotService();
      await expect(
        service.discardFile(workingDir, '../outside.txt', 'create'),
      ).rejects.toThrow('File path must stay within the workspace');
      expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('keep');
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  });
});
