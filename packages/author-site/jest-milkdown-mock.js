// @milkdown 及其子包为 ESM-only，jest(CJS) 无法解析其 exports 的 import 条件。
// 通过 moduleNameMapper 将 `@milkdown/*` 全部映射到本 mock。
// 相关测试不渲染 DocumentEditor（渲染它的测试会各自 jest.mock），这里仅需保证模块可被 import。
const React = require('react');

const command = () => ({ key: 'mock-command' });

class PluginKey {
  constructor(key) { this.key = key; }
  getState() { return undefined; }
}

class Mark {
  static sameSet(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((mark, index) => mark === right[index]);
  }
}

module.exports = {
  // @milkdown/crepe
  Crepe: class {
    static Feature = {
      Cursor: 'cursor', ListItem: 'list-item', LinkTooltip: 'link-tooltip',
      ImageBlock: 'image-block', BlockEdit: 'block-edit', Placeholder: 'placeholder',
      Toolbar: 'toolbar', CodeMirror: 'code-mirror', Table: 'table', Latex: 'latex',
      TopBar: 'top-bar', AI: 'ai',
    };
    constructor() { this.editor = { action: () => undefined }; }
    setReadonly() { return this; }
    addFeature() { return this; }
    on() { return this; }
    create() { return Promise.resolve(); }
    destroy() { return Promise.resolve(); }
  },

  // @milkdown/react
  Milkdown: () => React.createElement('div', { 'data-testid': 'milkdown-editor' }),
  MilkdownProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  useEditor: () => ({ loading: false, get: () => undefined }),
  useInstance: () => [false, () => undefined],

  // @prosemirror-adapter/react
  ProsemirrorAdapterProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  usePluginViewFactory: () => () => ({}),
  usePluginViewContext: () => ({ view: {}, prevState: undefined }),

  // legacy native-ui compatibility for older isolated mocks
  slash: { key: 'slash' },
  tooltip: { key: 'tooltip' },
  block: { key: 'block' },
  cursor: [],
  slashFactory: () => ({ key: 'slash' }),
  tooltipFactory: () => ({ key: 'tooltip' }),
  SlashProvider: class { update() {} destroy() {} },
  TooltipProvider: class { update() {} destroy() {} },
  BlockProvider: class { update() {} destroy() {} },
  SlashView: () => null,
  TooltipView: () => null,
  BlockView: () => null,

  // @milkdown/kit/core
  Editor: {
    make: () => ({
      config: () => ({ use: () => ({ create: () => Promise.resolve({}) }) }),
      use: () => ({ create: () => Promise.resolve({}) }),
    }),
  },
  rootCtx: {},
  defaultValueCtx: {},
  editorViewOptionsCtx: {},
  editorViewCtx: {},
  schemaCtx: {},

  // presets
  commonmark: [],
  gfm: [],

  // command factories / commands
  wrapInHeadingCommand: command(),
  toggleStrongCommand: command(),
  toggleEmphasisCommand: command(),
  toggleInlineCodeCommand: command(),
  wrapInBulletListCommand: command(),
  wrapInOrderedListCommand: command(),
  wrapInBlockquoteCommand: command(),
  createCodeBlockCommand: command(),
  insertHrCommand: command(),
  toggleLinkCommand: command(),
  turnIntoTextCommand: command(),
  toggleStrikethroughCommand: command(),
  insertTableCommand: command(),
  undoCommand: command(),
  redoCommand: command(),

  // utils
  callCommand: () => () => true,
  insert: () => () => true,
  replaceAll: () => () => true,
  getMarkdown: () => () => '',
  $command: () => command(),
  $ctx: (_value, name) => ({ key: name }),
  $prose: (factory) => ({ key: 'mock-prose', factory }),

  // plugins
  history: [],
  listener: [],
  clipboard: [],
  trailing: [],
  indent: [],
  listenerCtx: {
    markdownUpdated: () => {},
    selectionUpdated: () => {},
    updated: () => {},
  },

  // @milkdown/kit/prose/state
  EditorState: class {},
  Plugin: class {
    constructor(spec) { this.spec = spec; }
  },
  PluginKey,
  TextSelection: class {},

  // @milkdown/kit/prose/model and @milkdown/kit/prose/view
  Mark,
  Decoration: { inline: (_from, _to, attrs) => ({ attrs }) },
  DecorationSet: { create: (_doc, decorations) => ({ decorations }) },
};
