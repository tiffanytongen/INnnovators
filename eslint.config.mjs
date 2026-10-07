import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["mobile/metro.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" }, // Metro loads CommonJS configuration.
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "mobile/node_modules/**",
    "mobile/.expo/**",
    "mobile/dist/**",
  ]),
]);

export default eslintConfig;
