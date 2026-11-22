// React 版と同じ CSS(style.css / style.layer.css / themes/*.css と、その副作用 import 用の空 d.ts)を React 版の dist から
//   写します(build:lib の最後)。Solid 版は React 版と同じ DOM と class で描くので、CSS は同じものです(作り直さずに写すので
//   ずれない)。React 版の dist が先に要るので、package.json の devDependencies に React 版(workspace:*)を入れて、
//   ルートの build:lib(pnpm -r)が React 版の後に Solid 版を作るようにしています。
//   公開は package.json の publishConfig.exports に 1 つずつ書きます(書き忘れたらビルドを止める。React 版の emit-layer-css と同じ)。
// 実行: cwd はパッケージ直下(packages/solid)。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const REACT_DIST = '../react/dist';
if (!existsSync(`${REACT_DIST}/style.css`) || !existsSync(`${REACT_DIST}/style.layer.css`)) {
  console.error('emit-css: React 版の dist/style.css がありません(先に React 版の build:lib を実行してください)');
  process.exit(1);
}
// 追加(段階 3-3 のレビュー): React 版の CSS のソースが dist より新しければ止める(React 版を作り直さずに Solid 版だけ
//   作ると、古い CSS を写して公開してしまう)。
const REACT_SRC = '../react/src';
const reactSources = ['styles.css', ...readdirSync(`${REACT_SRC}/themes`).filter((name) => name.endsWith('.css')).map((name) => `themes/${name}`)];
const reactDistMtime = statSync(`${REACT_DIST}/style.css`).mtimeMs;
const newerSources = reactSources.filter((name) => statSync(`${REACT_SRC}/${name}`).mtimeMs > reactDistMtime);
if (newerSources.length > 0) {
  console.error(`emit-css: React 版の CSS のソースが dist より新しいです(${newerSources.join(' / ')})。先に React 版の build:lib を実行してください`);
  process.exit(1);
}
const themes = readdirSync(`${REACT_DIST}/themes`)
  .filter((name) => name.endsWith('.css'))
  .map((name) => `themes/${name}`);
const files = ['style.css', 'style.layer.css', ...themes];
const exportsField = JSON.parse(readFileSync('package.json', 'utf8')).publishConfig?.exports ?? {};
const unexported = files.filter(
  (name) => exportsField[`./${name}`]?.default !== `./dist/${name}` || exportsField[`./${name}`]?.types !== `./dist/${name}.d.ts`,
);
if (unexported.length > 0) {
  console.error(`emit-css: package.json の publishConfig.exports に次の CSS がありません: ${unexported.join(' / ')}`);
  process.exit(1);
}
// 逆向き: exports に書いた CSS が React 版の dist に無い(テーマを消した・改名した)ときも止める。
const missing = Object.keys(exportsField)
  .filter((key) => key.endsWith('.css'))
  .map((key) => key.slice(2))
  .filter((name) => !files.includes(name));
if (missing.length > 0) {
  console.error(`emit-css: package.json の exports の次の CSS が React 版の dist にありません: ${missing.join(' / ')}`);
  process.exit(1);
}
// 開発時の exports(ワークスペースの中で使うとき)にも同じ CSS を書く(publishConfig.exports と同じ dist を指す)。
const devExports = JSON.parse(readFileSync('package.json', 'utf8')).exports ?? {};
const devMismatch = files.filter((name) => JSON.stringify(devExports[`./${name}`]) !== JSON.stringify(exportsField[`./${name}`]));
if (devMismatch.length > 0) {
  console.error(`emit-css: package.json の exports(開発時)の次の CSS が publishConfig.exports と違います: ${devMismatch.join(' / ')}`);
  process.exit(1);
}
mkdirSync('dist/themes', { recursive: true });
// 変更(0.1.0 の前の実アプリ点検 S3-05): テーマの CSS の先頭の使い方のコメントは React 版のパッケージ名で書いてあるので、
//   Solid 版のパッケージ名へ書き換えて写します(中身のセレクタと値は同じ)。
const REACT_PACKAGE_PATH = '@ishibashi0112/spreadsheet-grid/';
const SOLID_PACKAGE_PATH = '@ishibashi0112/spreadsheet-grid-solid/';
for (const name of files) {
  const css = readFileSync(`${REACT_DIST}/${name}`, 'utf8');
  writeFileSync(`dist/${name}`, css.split(REACT_PACKAGE_PATH).join(SOLID_PACKAGE_PATH));
  copyFileSync(`${REACT_DIST}/${name}.d.ts`, `dist/${name}.d.ts`);
}
console.log(`emit-css: ${files.join(' / ')} を React 版の dist から写しました`);