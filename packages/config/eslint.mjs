import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeBuiltins = [
  { name: "node:*", message: "game-core phải chạy được ở trình duyệt và server." },
];

const banned = (group, message) => ({
  "no-restricted-imports": ["error", { patterns: [{ group, message }] }],
});

/** Ranh giới package theo mục 15.3 của tài liệu thiết kế. */
export const boundaryRules = [
  {
    files: ["packages/**/*.{ts,tsx}"],
    ignores: ["packages/config/**"],
    rules: banned(
      ["@dnw/web", "@dnw/api", "@dnw/realtime"],
      "packages không import apps (mục 15.3).",
    ),
  },
  {
    files: ["packages/game-core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "three",
                "three/*",
                "@react-three/*",
                "react",
                "react-dom",
                "colyseus",
                "colyseus.js",
                "@colyseus/*",
                "pg",
                "drizzle-orm",
                "drizzle-orm/*",
                "@dnw/db",
                "@dnw/web",
                "@dnw/api",
                "@dnw/realtime",
                "fastify",
                "next",
                "next/*",
              ],
              message: "game-core chỉ chứa hàm thuần (mục 15.2).",
            },
            ...nodeBuiltins.map(({ name, message }) => ({ group: [name], message })),
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "game-core không dùng DOM." },
        { name: "document", message: "game-core không dùng DOM." },
        { name: "process", message: "game-core không đọc env/Node." },
      ],
    },
  },
  {
    files: ["packages/game-config/src/**/*.ts", "packages/schemas/src/**/*.ts"],
    rules: banned(
      ["@dnw/db", "@dnw/api", "@dnw/realtime", "@dnw/web", "pg", "drizzle-orm", "drizzle-orm/*"],
      "schemas và game-config không import DB hay app.",
    ),
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: banned(
      ["@dnw/db", "@dnw/db/*", "pg", "drizzle-orm", "drizzle-orm/*"],
      "web chỉ nói chuyện với API qua HTTP (mục 15.3).",
    ),
  },
  {
    files: ["apps/realtime/**/*.ts"],
    rules: banned(
      ["@dnw/api", "@dnw/api/*", "**/apps/api/**"],
      "realtime không import code từ api (mục 15.3).",
    ),
  },
];

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.turbo/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  ...boundaryRules,
);
