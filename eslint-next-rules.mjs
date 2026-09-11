const sharedNextRules = {
  // Keep these framework migration findings opt-in until the existing code is
  // migrated deliberately; the established hooks and accessibility checks
  // remain enabled by eslint-config-next.
  "react-hooks/error-boundaries": "off",
  "react-hooks/immutability": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/purity": "off",
  "react-hooks/refs": "off",
  "react-hooks/set-state-in-effect": "off",
};

/** Shared rule block for Next applications using either ESLint 8 or 9. */
export function createNextEslintRules() {
  return {
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: { ...sharedNextRules },
  };
}

/** Package configs retain their own additional ignore entries. */
export function createNextEslintIgnores(ignores = []) {
  return [".next/**", "coverage/**", ...ignores];
}
