import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'packages/*/dist', 'website']),
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
])
