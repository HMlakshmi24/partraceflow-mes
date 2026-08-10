import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Left at "warn": 330 existing call sites use `any`. Flipping to
      // "error" would need each one individually typed correctly (a
      // wrong type is worse than an honest `any`) — tracked as a
      // follow-up, not fixed blind. no-require-imports/no-unescaped-
      // entities/prefer-const below had zero or few violations and are
      // fixed and enforced as errors.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "error",
      // Left at "off": re-enabling surfaces 27 existing violations across
      // React components (setState-in-effect, memoization, purity) that
      // would need individual, careful review to fix without risking subtle
      // behavioral regressions — tracked as a follow-up, not fixed blind.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
