/**
 * Minimal Turbopack-compatible equivalent of webpack's raw-loader for static
 * text resources. It keeps Markdown prompt authoring separate from client code
 * while emitting a standard ESM string default export.
 */
module.exports = function rawTextLoader(source) {
  return `export default ${JSON.stringify(source)};`;
};
