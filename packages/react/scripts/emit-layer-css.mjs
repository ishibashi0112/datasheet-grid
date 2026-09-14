// dist/style.layer.css を生成します(THEME-1)。
// 目的: Tailwind v4 などカスケードレイヤーを運用する利用側向けに、全スタイルを
//   `@layer ssg-base` へ入れたバリアントを提供します(Mantine の styles.css /
//   styles.layer.css と同じ二本立て)。実体は 1 行の @import layer() で、
//   利用側のバンドラ(vite / postcss-import 等)が同ディレクトリの dist/style.css を
//   レイヤーへ取り込みます(CSS の複製を持たないため中身の乖離が起きません)。
// 実行: build:lib の最終ステップ(vite build → tsc → 本スクリプト)。cwd はリポジトリ直下。
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (!existsSync('dist/style.css')) {
  console.error('emit-layer-css: dist/style.css がありません(vite build 後に実行してください)');
  process.exit(1);
}

writeFileSync(
  'dist/style.layer.css',
  '@import url("./style.css") layer(ssg-base);\n',
);
console.log('emit-layer-css: dist/style.layer.css を生成しました');

// 追加(⑤-2 事後): tsc は副作用 import(`import './styles.css'`)を d.ts にも残します。利用側が skipLibCheck: false
//   で型検査すると .css を解決できず TS2882 になる(vite/client の '*.css' 宣言は配布物に含まれない)ため、
//   dist の d.ts から .css の副作用 import 行を取り除きます(実行時の CSS 読み込みは元から利用側の
//   `import '<pkg>/style.css'` で行い、JS からは注入しない設計のため、型定義から消しても挙動は不変)。
const stripCssImports = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      stripCssImports(full);
      continue;
    }
    if (!name.endsWith('.d.ts')) continue;
    const source = readFileSync(full, 'utf8');
    const stripped = source.replace(/^import '[^']*\.css';\n?/gm, '');
    if (stripped !== source) {
      writeFileSync(full, stripped);
      console.log(`emit-layer-css: ${full} から .css の副作用 import を除去しました`);
    }
  }
};
stripCssImports('dist');