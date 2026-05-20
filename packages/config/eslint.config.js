/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: false,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "next/core-web-vitals",
  ],
  settings: { react: { version: "detect" } },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
  },
  ignorePatterns: ["node_modules", ".next", "dist", "build", ".turbo", "*.config.js", "*.config.mjs"],
};
