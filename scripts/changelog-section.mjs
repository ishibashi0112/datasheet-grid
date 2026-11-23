// 追加(広報 1: 入口の整備): CHANGELOG.md から指定した版の節(見出しの次の行から次の「## 」の手前まで)を取り出して標準出力へ書きます。
//   GitHub Releases の本文に使います(.github/workflows/release.yml)。
//   使い方: node scripts/changelog-section.mjs <X.Y.Z | vX.Y.Z>
//     節が無いときは終了コード 1(リリース本文が空のまま出ないように)。
//   --list を付けると、CHANGELOG.md に載っている版を古い順に 1 行ずつ出します(過去の版の Releases をまとめて作るとき用)。
//   追加(Solid 版 0.1.0): `solid-vX.Y.Z`(Solid 版のタグ)を渡すと、Solid 版の packages/solid/CHANGELOG.md から取り出します
//     (0.1.x の Solid 版は React 版・core と別の版で、solid-vX.Y.Z のタグを付けていた。--list は React 版と core の版だけ)。
//   追加(Solid 版 段 3-8): 1.4.0 から Solid 版も React 版・core と同じ版で、タグは vX.Y.Z の 1 つです。その版からは、Solid 版の
//     変更履歴に同じ版の節があれば「## Solid 版」の見出しで後ろに足します(「Solid 版だけの変更はありません」で始まる節 =
//     bump-version.mjs が足す節は足さない)。版をそろえた 1.4.0 の Solid 版の節は 0.1.2 からの変更なので、見出しにそう書きます。
//     Solid 版だけを直した版も、bump-version.mjs がルートに「React 版と core の変更はありません」の節を作るので、ここで止まりません。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOLID_TAG_PREFIX = 'solid-v';
const ALIGNED_FROM = '1.4.0';
const NO_SOLID_CHANGES = /^Solid 版だけの変更はありません/;
const REPO = 'https://github.com/ishibashi0112/datasheet-grid/blob/main/';
const isSolid = (process.argv[2] ?? '').startsWith(SOLID_TAG_PREFIX);
const readLines = (solid) =>
  readFileSync(fileURLToPath(new URL(solid ? '../packages/solid/CHANGELOG.md' : '../CHANGELOG.md', import.meta.url)), 'utf8').split('\n');
const changelogName = isSolid ? 'packages/solid/CHANGELOG.md' : 'CHANGELOG.md';
const lines = readLines(isSolid);
// 見出しは「## 0.54.0 — 2026-10-25」の形。未リリースの節(## 未リリース)は版として数えません。
const VERSION_HEADING = /^## (\d+\.\d+\.\d+)(?:\s|$)/;

if (process.argv[2] === '--list') {
  const versions = lines.flatMap((line) => {
    const match = VERSION_HEADING.exec(line);
    return match ? [match[1]] : [];
  });
  console.log(versions.reverse().join('\n'));
  process.exit(0);
}

const version = (process.argv[2] ?? '').replace(isSolid ? SOLID_TAG_PREFIX : /^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: node scripts/changelog-section.mjs <X.Y.Z | vX.Y.Z | solid-vX.Y.Z | --list>');
  process.exit(1);
}

// 節の本文(無ければ undefined)。相対リンク(./docs/... など)は Releases のページでは解決されないため、リポジトリの main への
//   絶対 URL に直します(Solid 版の変更履歴の相対リンクは packages/solid/ から)。
const readSection = (sectionLines, solid) => {
  const start = sectionLines.findIndex((line) => VERSION_HEADING.exec(line)?.[1] === version);
  if (start === -1) return undefined;
  let end = sectionLines.findIndex((line, index) => index > start && line.startsWith('## '));
  if (end === -1) end = sectionLines.length;
  const body = sectionLines.slice(start + 1, end).join('\n').trim();
  const base = `${REPO}${solid ? 'packages/solid/' : ''}`;
  return body.replace(/\]\(\.\.\/\.\.\//g, `](${REPO}`).replace(/\]\(\.\//g, `](${base}`);
};

const body = readSection(lines, isSolid);
if (body === undefined) {
  console.error(`changelog-section: ${changelogName} に ${version} の節がありません`);
  process.exit(1);
}
if (body === '') {
  console.error(`changelog-section: ${version} の節が空です`);
  process.exit(1);
}
const [a0, a1, a2] = version.split('.').map(Number);
const [b0, b1, b2] = ALIGNED_FROM.split('.').map(Number);
const aligned = !isSolid && (a0 - b0 || a1 - b1 || a2 - b2) >= 0;
const solidBody = aligned ? readSection(readLines(true), true) : undefined;
const withSolid =
  solidBody !== undefined && solidBody !== '' && !NO_SOLID_CHANGES.test(solidBody)
    ? `${body}\n\n## Solid 版(\`@ishibashi0112/spreadsheet-grid-solid\`${version === ALIGNED_FROM ? '。0.1.2 からの変更' : ''})\n\n${solidBody}`
    : body;
console.log(withSolid);