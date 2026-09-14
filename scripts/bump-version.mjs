// 追加(非依存化 ⑤-2): 公開パッケージ(packages/core / packages/react)の版を揃えて上げ、コミット + タグを作ります。
//   旧「vp exec pnpm version minor」(単一パッケージ時代)の代替です。pnpm の version は workspace の recursive
//   モードではコミット / タグを作らないため、ここで従来どおり「X.Y.Z」コミットと vX.Y.Z タグを作ります。
//   使い方(作業ツリーがクリーンな状態で): node scripts/bump-version.mjs <major|minor|patch>
//   その後の publish は `pnpm -r publish --access public`(core → react の順に、各パッケージで 2FA)。
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const kind = process.argv[2];
if (!['major', 'minor', 'patch'].includes(kind)) {
  console.error('usage: node scripts/bump-version.mjs <major|minor|patch>');
  process.exit(1);
}
if (execSync('git status --porcelain').toString().trim() !== '') {
  console.error('bump-version: 作業ツリーがクリーンではありません');
  process.exit(1);
}

const packages = ['packages/core/package.json', 'packages/react/package.json'];
const current = JSON.parse(readFileSync(packages[0], 'utf8')).version;
const [major, minor, patch] = current.split('.').map(Number);
const next =
  kind === 'major' ? `${major + 1}.0.0` : kind === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;

for (const file of packages) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = next;
  writeFileSync(file, JSON.stringify(pkg, null, 2));
}
execSync(`git add ${packages.join(' ')}`);
execSync(`git commit -q -m "${next}"`);
// 注釈付きタグにします(`git push --follow-tags` は注釈付きタグしか push しない。pnpm version と同じ挙動)。
execSync(`git tag -a v${next} -m ${next}`);
console.log(`bumped ${current} -> ${next} (commit + tag v${next})`);