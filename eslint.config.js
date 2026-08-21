// flat config for eslint 9, matches the existing codebase style
// semicolons and double quotes are the convention, no-undef catches missing imports early
import js from "@eslint/js";

const browserGlobals = {
  document: "readonly",
  window: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  requestAnimationFrame: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  alert: "readonly",
  DOMParser: "readonly",
  XMLSerializer: "readonly",
  Blob: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Image: "readonly",
  File: "readonly",
  FileReader: "readonly",
  PointerEvent: "readonly",
  KeyboardEvent: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  visualViewport: "readonly",
  performance: "readonly",
  location: "readonly",
  console: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      // swallowing pointer-capture failures is intentional in the gesture pipeline
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...browserGlobals,
        process: "readonly",
      },
    },
    rules: {
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
    },
  },
];
