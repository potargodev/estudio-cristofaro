import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  // .claude/skills: herramientas de terceros (Impeccable), no son código de Faro
  { ignores: [".next/**", "node_modules/**", "dist/**", "next-env.d.ts", "public/**", ".claude/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Convención del proyecto: un parámetro o variable que empieza con _ no se usa a propósito
    // (firmas de useActionState, desestructurar para sacar una clave)
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }] },
  },
];

export default config;
