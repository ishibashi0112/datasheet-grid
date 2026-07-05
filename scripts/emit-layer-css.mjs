// dist/style.layer.css を生成します(THEME-1)。
// 目的: Tailwind v4 などカスケードレイヤーを運用する利用側向けに、全スタイルを
//   `@layer ssg-base` へ入れたバリアントを提供します(Mantine の styles.css /
//   styles.layer.css と同じ二本立て)。実体は 1 行の @import layer() で、
//   利用側のバンドラ(vite / postcss-import 等)が同ディレクトリの dist/style.css を
//   レイヤーへ取り込みます(CSS の複製を持たないため中身の乖離が起きません)。
// 実行: build:lib の最終ステップ(vite build → tsc → 本スクリプト)。cwd はリポジトリ直下。
import { existsSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/style.css')) {
  console.error('emit-layer-css: dist/style.css がありません(vite build 後に実行してください)');
  process.exit(1);
}

writeFileSync(
  'dist/style.layer.css',
  '@import url("./style.css") layer(ssg-base);\n',
);
console.log('emit-layer-css: dist/style.layer.css を生成しました');
