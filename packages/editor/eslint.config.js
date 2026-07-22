import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // "src/engine" (not just "engine") so this doesn't also catch the
              // legitimate `workflow-engine/engine/*` package-name imports that
              // go through the exports map (task 4.2) — those never contain the
              // literal "src/engine" segment a relative traversal does.
              group: ["**/src/engine/**"],
              message:
                "packages/editor may only reach the engine through the workflow-engine package's exports map (./schema, ./cel/check, ./schema/compile), never via a relative import into src/engine.",
            },
          ],
        },
      ],
    },
  },
);
