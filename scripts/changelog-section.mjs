// 追加(広報 1: 入口の整備): CHANGELOG.md から指定した版の節(見出しの次の行から次の「## 」の手前まで)を取り出して標準出力へ書きます。
//   GitHub Releases の本文に使います(.github/workflows/release.yml)。
//   使い方: node scripts/changelog-section.mjs <X.Y.Z | vX.Y.Z>
//     節が無いときは終了コード 1(リリース本文が空のまま出ないように)。
//   --list を付けると、CHANGELOG.md に載っている版を古い順に 1 行ずつ出します(過去の版の Releases をまとめて作るとき用)。
//   追加(Solid 版 0.1.0): `solid-vX.Y.Z`(Solid 版のタグ)を渡すと、Solid 版の packages/solid/CHANGELOG.md から取り出します
//     (Solid 版の版は React 版・core と別。--list は React 版と core の版だけ)。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOLID_TAG_PREFIX = 'solid-v';
const isSolid = (process.argv[2] ?? '').startsWith(SOLID_TAG_PREFIX);
const changelogPath = fileURLToPath(
  new URL(isSolid ? '../packages/solid/CHANGELOG.md' : '../CHANGELOG.md', import.meta.url),
);
const changelogName = isSolid ? 'packages/solid/CHANGELOG.md' : 'CHANGELOG.md';
const lines = readFileSync(changelogPath, 'utf8').split('\n');
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

const start = lines.findIndex((line) => VERSION_HEADING.exec(line)?.[1] === version);
if (start === -1) {
  console.error(`changelog-section: ${changelogName} に ${version} の節がありません`);
  process.exit(1);
}
let end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
if (end === -1) end = lines.length;
const body = lines.slice(start + 1, end).join('\n').trim();
if (body === '') {
  console.error(`changelog-section: ${version} の節が空です`);
  process.exit(1);
}
// 相対リンク(./docs/... など)は Releases のページでは解決されないため、リポジトリの main への絶対 URL に直します
//   (Solid 版の変更履歴の相対リンクは packages/solid/ から)。
const REPO_BLOB = `https://github.com/ishibashi0112/datasheet-grid/blob/main/${isSolid ? 'packages/solid/' : ''}`;
console.log(body.replace(/\]\(\.\//g, `](${REPO_BLOB}`));