/**
 * 销毁会话命令
 */

import chalk from 'chalk';
import { request, createSpinner, showSuccess, showError } from '../utils.js';

export async function destroySession(baseUrl: string, sessionId: string): Promise<void> {
  console.log(chalk.cyan('\n=== 销毁会话 ===\n'));
  console.log(chalk.gray(`会话 ID: ${sessionId}\n`));

  const spinner = createSpinner('正在销毁会话...');

  try {
    const response = await request<{ sessionId: string; destroyed: boolean }>(
      baseUrl,
      `/api/agent/${sessionId}`,
      {
        method: 'DELETE',
      }
    );

    spinner.stop();

    if (!response.success) {
      showError('销毁失败', response.error);
      process.exit(1);
    }

    showSuccess(`会话 ${sessionId} 已销毁`);
    console.log(chalk.gray(`\n销毁结果: ${response.data.destroyed ? '成功' : '失败'}`));
    console.log('');
  } catch (error) {
    spinner.stop();
    showError('请求失败');
    console.error(chalk.red(`\n错误详情: ${error instanceof Error ? error.message : '未知错误'}`));
    process.exit(1);
  }
}
