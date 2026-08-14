import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "jest-milkdown-mock.js",
  ]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // These React Compiler guidance rules are newly enabled by Next 16's
      // config. They expose existing patterns and are tracked separately from
      // the framework migration; retain the established hooks/a11y checks.
      "react-hooks/error-boundaries": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
