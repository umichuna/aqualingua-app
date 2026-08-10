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
    // ローカル作業用スクリプト（.gitignore と同じ一覧）。git 追跡外だが手元には残るため、
    // アプリのコードと同じ基準で lint しない（Node の require で書かれている）
    "create-db-user*.js",
    "setup_azure_user.js",
    "test-azure-sql-connection.js",
    "test-local-sync.js",
    "debug-page-state.js",
    "verify-*.js",
    "filter.js",
  ]),
  {
    rules: {
      // 引数名を `_` で始めたものは「意図的に使っていない」の意味で使う。
      // 呼び出し側が実引数を渡しているため signature から消せない引数がある
      // （gameLogic.ts の _jobLevel / _tankCapacity / _boxCapacity）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
