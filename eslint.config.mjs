import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // We render icons by looking up a stable component reference from a
      // fixed map (lib/icon-map.tsx) — a standard "dynamic icon" pattern,
      // not a component being created during render.
      "react-hooks/static-components": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party library, served as-is for the standalone Vault page.
    "public/vault/vendor/**",
  ]),
]);

export default eslintConfig;
