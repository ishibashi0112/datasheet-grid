// 追加(非依存化 ⑤-2): 公開パッケージ(packages/core / packages/react)の版を揃えて上げ、コミット + タグを作ります。
//   旧「vp exec pnpm version minor」(単一パッケージ時代)の代替です。pnpm の version は workspace の recursive
//   モードではコミット / タグを作らないため、ここで従来どおり「X.Y.Z」コミットと vX.Y.Z タグを作ります。
//   使い方(作業ツリーがクリーンな状態で): node scripts/bump-version.mjs <major|minor|patch|X.Y.Z>
//     X.Y.Z は版を明示する形(2026-10-10 追加)。npm に誤った版が先に上がってしまい、連番を飛ばしたいとき
//     (例: core 0.46.0 だけ旧コードで公開されたので実体は 0.46.1 にする)に使う。現行より大きい版だけ受け付ける。
//   必ず **origin/main を取り込んだ main 上**で実行する(古い main の上で実行すると、新機能を含まないコードに
//   新しい版番号が付いて公開されてしまう。2026-10-10 の 0.46.0 がその例)。
//   その後の publish は `pnpm -r publish --access public`(core → react の順に、各パッケージで 2FA)。
//   追加(広報 1: 入口の整備): CHANGELOG.md の「## 未リリース」の見出しを「## X.Y.Z — 今日の日付」に書き換えて同じコミットに含めます。
//     タグを push すると .github/workflows/release.yml がこの節を本文にして GitHub Release を作ります。
//     「未リリース」の節が無いときは警告だけ出して続けます(Release は本文が無いので作られません)。
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const kind = process.argv[2];
const EXPLICIT = /^\d+\.\d+\.\d+$/;
if (!['major', 'minor', 'patch'].includes(kind) && !EXPLICIT.test(kind ?? '')) {
  console.error('usage: node scripts/bump-version.mjs <major|minor|patch|X.Y.Z>');
  process.exit(1);
}
if (execSync('git status --porcelain').toString().trim() !== '') {
  console.error('bump-version: 作業ツリーがクリーンではありません');
  process.exit(1);
}

const packages = ['packages/core/package.json', 'packages/react/package.json'];
const current = JSON.parse(readFileSync(packages[0], 'utf8')).version;
const [major, minor, patch] = current.split('.').map(Number);
const compareVersions = (a, b) => {
  const [a0, a1, a2] = a.split('.').map(Number);
  const [b0, b1, b2] = b.split('.').map(Number);
  return a0 - b0 || a1 - b1 || a2 - b2;
};
const next =
  kind === 'major'
    ? `${major + 1}.0.0`
    : kind === 'minor'
      ? `${major}.${minor + 1}.0`
      : kind === 'patch'
        ? `${major}.${minor}.${patch + 1}`
        : kind;
if (compareVersions(next, current) <= 0) {
  console.error(`bump-version: 指定の版 ${next} は現行 ${current} より大きくありません`);
  process.exit(1);
}

for (const file of packages) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = next;
  writeFileSync(file, JSON.stringify(pkg, null, 2));
}
const changelog = 'CHANGELOG.md';
const UNRELEASED_HEADING = /^## 未リリース[ \t]*$/m;
const changelogText = readFileSync(changelog, 'utf8');
const staged = [...packages];
if (UNRELEASED_HEADING.test(changelogText)) {
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
  writeFileSync(changelog, changelogText.replace(UNRELEASED_HEADING, `## ${next} — ${today}`));
  staged.push(changelog);
} else {
  console.warn('bump-version: CHANGELOG.md に「## 未リリース」の節がありません(GitHub Release の本文が作られません)');
}
execSync(`git add ${staged.join(' ')}`);
execSync(`git commit -q -m "${next}"`);
// 注釈付きタグにします(`git push --follow-tags` は注釈付きタグしか push しない。pnpm version と同じ挙動)。
execSync(`git tag -a v${next} -m ${next}`);
console.log(`bumped ${current} -> ${next} (commit + tag v${next})`);