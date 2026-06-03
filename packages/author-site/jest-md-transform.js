/**
 * Jest 转换器：将 .md 文件内容转为 JS 模块导出
 * 配合 webpack asset/source 规则，构建和测试都能正确导入 .md 文件
 */
module.exports = {
  process(sourceText) {
    return {
      code: `module.exports = ${JSON.stringify(sourceText)};`,
    };
  },
};
