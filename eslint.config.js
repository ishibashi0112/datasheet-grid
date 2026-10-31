import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// 追加(semver / 1.0 の準備): core の旧サブパス(`@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`。非推奨)の import を止めます。
//   gitignore と同じ書き方なので、`internal/*` を通すには親の `internal` も通す必要があります(`…-core/internal` だけの
//   import は exports に無く、型検査とビルドで落ちます)。`testing/*`(`testing/index` など)は旧 `./*` でしか解決しないので止めます。
//   見るのは import / export の文だけです(動的 import / `typeof import()` / vi.mock の文字列は見ない)。公開する dist は
//   size:check(scripts/measure-size.mjs の checkCoreImportPaths)が見ます。
const CORE_SUBPATH_PATTERN = {
  group: [
    '@ishibashi0112/spreadsheet-grid-core/*',
    '!@ishibashi0112/spreadsheet-grid-core/internal',
    '!@ishibashi0112/spreadsheet-grid-core/internal/*',
    '!@ishibashi0112/spreadsheet-grid-core/testing',
    '@ishibashi0112/spreadsheet-grid-core/testing/*',
  ],
  message: 'core の部品は `@ishibashi0112/spreadsheet-grid-core/internal/<dir>/<module>` から import します(旧サブパスは非推奨)。',
}

export default defineConfig([
  globalIgnores(['dist', 'packages/*/dist', 'examples/*/dist', 'website', 'audit']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // 追加(React 18 対応 2026-10-28): withRefProp(React 18 のときだけ forwardRef で包む)を memo / forwardRef と同じく
      //   コンポーネントを返す HOC として扱う(configs.vite の allowConstantExport はそのまま)。
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, extraHOCs: ['withRefProp'] }],
    },
  },
  // 追加(非依存化 ⑤-1 / 変更 ⑤-2): core パッケージ(packages/core)は React / react-dom / React 版パッケージを
  //   import しない。型は gridTypes.unbound(内部層用の未束縛束縛)か gridTypes.core(F ジェネリック)から取る
  //   (React 束縛の gridTypes.ts は packages/react 側にあり物理的にも参照できない)。
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'React 非依存の層です(CLAUDE.md「アーキテクチャ要点」)。' },
            { name: 'react-dom', message: 'React 非依存の層です。' },
          ],
          patterns: [
            {
              group: ['@ishibashi0112/spreadsheet-grid', '@ishibashi0112/spreadsheet-grid/*'],
              message: 'core は React 版パッケージに依存しません。',
            },
          ],
        },
      ],
    },
  },
  // 追加(React 18 対応 2026-10-28): React 版のライブラリは素の useLayoutEffect を使わない(React 18 の SSR の開発ビルドで描くたびに
  //   警告が出る)。hooks/useController の useIsomorphicLayoutEffect を使う。
  // 追加(semver / 1.0 の準備): React 版は core の部品を `…-core/internal/*` から import する(旧サブパス `…-core/<dir>/<module>` は
  //   非推奨で、次の minor で消す)。入口 `…-core` と `…-core/testing` はそのまま使える。
  {
    files: ['packages/react/src/**/*.{ts,tsx}'],
    ignores: ['packages/react/src/**/*.test.{ts,tsx}', 'packages/react/src/hooks/useController.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              importNames: ['useLayoutEffect'],
              message: 'hooks/useController の useIsomorphicLayoutEffect を使います(React 18 の SSR で警告が出ないように)。',
            },
          ],
          patterns: [CORE_SUBPATH_PATTERN],
        },
      ],
    },
  },
  {
    files: ['packages/react/src/**/*.test.{ts,tsx}', 'packages/react/src/hooks/useController.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [CORE_SUBPATH_PATTERN] }],
    },
  },
])
