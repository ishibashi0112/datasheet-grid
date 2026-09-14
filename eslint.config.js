import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'website']),
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
  // 追加(非依存化 ⑤-1): React 非依存の層(model / logic / controllers / engine / utils)は React と React 束縛の
  //   型(model/gridTypes.ts)を import しない。型は gridTypes.unbound(内部層用の未束縛束縛)か gridTypes.core
  //   (F ジェネリックのまま扱う場合)から取る。monorepo 分割(⑤-2)で core パッケージになる境界を先に lint で固定する。
  {
    files: ['src/components/spreadsheet-grid/{model,logic,controllers,engine,utils}/**/*.ts'],
    // gridTypes.ts は React 束縛そのもの、gridTypes.core.test.ts は React 束縛の型テスト(ReactNode の代入可否)。
    ignores: [
      'src/components/spreadsheet-grid/model/gridTypes.ts',
      'src/components/spreadsheet-grid/model/gridTypes.core.test.ts',
    ],
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
              group: ['**/model/gridTypes', '../model/gridTypes', './gridTypes'],
              message:
                'React 束縛の型(gridTypes.ts)ではなく gridTypes.unbound(内部層用)/ gridTypes.core(F ジェネリック)から import してください。',
            },
          ],
        },
      ],
    },
  },
])
