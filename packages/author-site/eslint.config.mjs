import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import {
  createNextEslintIgnores,
  createNextEslintRules,
} from "../../eslint-next-rules.mjs";

export default defineConfig([
  ...nextVitals,
  globalIgnores(createNextEslintIgnores(["jest-milkdown-mock.js"])),
  createNextEslintRules(),
]);
