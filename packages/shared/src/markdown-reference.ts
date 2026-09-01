// Jest's workspace module mapper resolves shared subpaths to a sibling .ts file.
// Keep this bridge alongside the directory entrypoint for both NodeNext and
// the package export `@workbench/shared/markdown-reference`.
export * from "./markdown-reference/index";
