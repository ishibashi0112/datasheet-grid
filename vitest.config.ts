import { defineConfig } from 'vitest/config';

// 追加(V-1): 等価性ハーネスの恒久化用 vitest 設定です。
//   - 本番ビルド設定(vite.config.ts)は変更しません。テストは別グラフで回します。
//   - V-1 は純ロジック(verticalGeometry / sorting / filtering / selectOptions)のみで
//     React 非依存のため environment は node。将来 V-2(collector フック)を足すときは
//     該当テストだけ jsdom へ振り分けます(environmentMatchGlobs などで個別指定)。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});