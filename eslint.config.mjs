import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

const sharedGlobals = {
  ...globals.browser,
  ...globals.es2025,
  ...globals.node,
};

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".tmp/**",
      ".worktrees/**",
      "out/**",
      "build/**",
      "reports/**",
      "next-env.d.ts",
    ],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: sharedGlobals,
    },
  },
  ...typescriptEslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat["recommended-latest"],
  {
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
