// streamdown 及其插件为 ESM-only，jest(CJS)无法解析。
// 通过 moduleNameMapper 全局兜底；单个测试内的 jest.mock("streamdown", factory) 仍可覆盖。
const React = require('react');

module.exports = {
  Streamdown: ({ children }) =>
    React.createElement('div', { 'data-testid': 'streamdown-renderer' }, children),
  code: {},
  mermaid: {},
  math: {},
  cjk: {},
};
