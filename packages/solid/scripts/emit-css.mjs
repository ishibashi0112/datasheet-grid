// React 版と同じ CSS(style.css / style.layer.css / themes/*.css と、その副作用 import 用の空 d.ts)を React 版の dist から
//   写します(build:lib の最後)。Solid 版は React 版と同じ DOM と class で描くので、CSS は同じものです(作り直さずに写すので
//   ずれない)。React 版の dist が先に要るので、package.json の devDependencies に React 版(workspace:*)を入れて、
//   ルートの build:lib(pnpm -r)が React 版の後に Solid 版を作るようにしています。
//   公開は package.json の publishConfig.exports に 1 つずつ書きます(書き忘れたらビルドを止める。React 版の emit-layer-css と同じ)。
// 実行: cwd はパッケージ直下(packages/solid)。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';

const REACT_DIST = '../react/dist';
if (!existsSync(`${REACT_DIST}/style.css`) || !existsSync(`${REACT_DIST}/style.layer.css`)) {
  console.error('emit-css: React 版の dist/style.css がありません(先に React 版の build:lib を実行してください)');
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
mkdirSync('dist/themes', { recursive: true });
for (const name of files) {
  copyFileSync(`${REACT_DIST}/${name}`, `dist/${name}`);
  copyFileSync(`${REACT_DIST}/${name}.d.ts`, `dist/${name}.d.ts`);
}
console.log(`emit-css: ${files.join(' / ')} を React 版の dist から写しました`);