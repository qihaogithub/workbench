/**
 * 从代码注释中提取 @dependency 声明
 *
 * 支持格式：
 *   // @dependency package-name
 *   // @dependency package@^1.0.0
 *   // @dependency @scope/package
 *   // @dependency @scope/package@^1.0.0
 */
export function extractDependenciesFromComments(code: string): Record<string, string> {
  const depRegex = /\/\/\s*@dependency\s+([^\n]+)/g;
  const deps: Record<string, string> = {};
  let match;

  while ((match = depRegex.exec(code)) !== null) {
    const depString = match[1].trim();
    const { name, version } = parseDependencyString(depString);

    if (name) {
      deps[name] = version;
    }
  }

  return deps;
}

/**
 * 解析依赖字符串
 *
 * @example
 * parseDependencyString('lodash')           // { name: 'lodash', version: 'latest' }
 * parseDependencyString('lodash@^4.0.0')   // { name: 'lodash', version: '^4.0.0' }
 * parseDependencyString('@scope/pkg@^1.0') // { name: '@scope/pkg', version: '^1.0' }
 */
function parseDependencyString(depString: string): { name?: string; version: string } {
  if (!depString) {
    return { version: 'latest' };
  }

  // 处理 scoped package: @scope/package@version
  if (depString.startsWith('@')) {
    const atIndex = depString.indexOf('@', 1); // 从第 2 个字符开始查找
    if (atIndex === -1) {
      return { name: depString, version: 'latest' };
    }
    return {
      name: depString.substring(0, atIndex),
      version: depString.substring(atIndex + 1) || 'latest',
    };
  }

  // 处理普通 package: package@version
  const atIndex = depString.indexOf('@');
  if (atIndex === -1) {
    return { name: depString, version: 'latest' };
  }
  return {
    name: depString.substring(0, atIndex),
    version: depString.substring(atIndex + 1) || 'latest',
  };
}
