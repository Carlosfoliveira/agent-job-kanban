import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript already checks for undefined references; no-undef is
      // redundant and produces false positives on browser/ES globals.
      "no-undef": "off",

      // Core hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React Compiler rules — must be enabled and set to error
      "react-hooks/config": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/gating": "error",
      "react-hooks/globals": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/purity": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/static-components": "error",
      "react-hooks/unsupported-syntax": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/incompatible-library": "error",
    },
  },
);
