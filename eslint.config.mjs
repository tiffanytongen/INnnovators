import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
<<<<<<< HEAD
    "mobile/node_modules/**",
    "mobile/.expo/**",
    "mobile/dist/**",
=======
    "mobile/**", // Expo app has its own config
>>>>>>> 531c703d045bec8f93e872f176c445ad09e78bad
  ]),
]);

export default eslintConfig;
