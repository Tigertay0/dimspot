import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // CommonJS on purpose: preloaded into the build with `node -r`.
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Imports .open-next/worker.js, which only exists after a build.
    files: ["worker.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare build output and local state.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
