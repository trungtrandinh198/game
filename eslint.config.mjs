import base from "./packages/config/eslint.mjs";

export default [
  ...base,
  {
    files: ["**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
];
