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
//   追加(広報 2: StackBlitz のサンプル): examples/*/package.json の @ishibashi0112/spreadsheet-grid も ^X.Y.Z へ書き換えて
//     同じコミットに含めます(サンプルは npm の公開版で動くため)。版上げを main へ push してから publish するまでの間は、
//     StackBlitz で開いたサンプルのインストールが失敗する(その版がまだ無い)ので、push の後は早めに publish します。
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

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
// 追加(semver / 1.0 の準備): core の旧サブパス(exports の `./*`)は 0.60.0 で非推奨にし、0.61.0 で消すと CHANGELOG と
//   ドキュメントに書いています。消し忘れたまま 0.61.0 以上を出さないよう、ここで止めます。
const coreManifest = JSON.parse(readFileSync(packages[0], 'utf8'));
const hasOldSubpaths = (exportsMap) => typeof exportsMap === 'object' && exportsMap !== null && './*' in exportsMap;
if (compareVersions(next, '0.61.0') >= 0 && (hasOldSubpaths(coreManifest.exports) || hasOldSubpaths(coreManifest.publishConfig?.exports))) {
  console.error(
    'bump-version: core の旧サブパス(exports の `./*`)は 0.61.0 で消す約束です。packages/core/package.json の exports と publishConfig.exports から `./*` を消し、「0.61.0 で消す」と書いたドキュメントとコメント(`git grep -n 0.61.0` で出るもの)を直し、CHANGELOG の「core の破壊的変更」に書いてから版を上げてください。',
  );
  process.exit(1);
}

// 追加(1.0 の準備): 非推奨の表(packages/core/src/utils/deprecation.ts の DEPRECATIONS)に、消す版(removeIn)が
//   次の版以下のものが残っていれば止めます(非推奨にしたものの消し忘れ)。消すときは表から外し、警告の呼び出しと
//   API リファレンス(両方)の行と JSDoc を消し、CHANGELOG の「## 未リリース」に書いてから版を上げます。
//   表は TypeScript の構文木で読みます(空の `{}`、引用符の違い、キーの書き方に左右されないように。読めない書き方なら止める)。
const DEPRECATIONS_PATH = 'packages/core/src/utils/deprecation.ts';
const readDeprecations = () => {
  const sourceFile = ts.createSourceFile(DEPRECATIONS_PATH, readFileSync(DEPRECATIONS_PATH, 'utf8'), ts.ScriptTarget.Latest, true);
  const fail = (reason) => {
    console.error(`bump-version: ${DEPRECATIONS_PATH} の DEPRECATIONS を読めません(${reason})`);
    process.exit(1);
  };
  let table;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'DEPRECATIONS') continue;
      let initializer = declaration.initializer;
      while (
        initializer !== undefined &&
        (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer))
      ) {
        initializer = initializer.expression;
      }
      if (initializer !== undefined && ts.isObjectLiteralExpression(initializer)) table = initializer;
    }
  }
  if (table === undefined) fail('オブジェクトのリテラルが見つからない');
  return table.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
      fail(`項目 ${property.getText(sourceFile).slice(0, 40)} がオブジェクトのリテラルではない`);
    }
    const id = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : property.name.getText(sourceFile);
    const removeIn = property.initializer.properties.find(
      (field) => ts.isPropertyAssignment(field) && field.name.getText(sourceFile).replace(/['"]/g, '') === 'removeIn',
    );
    if (removeIn === undefined || !ts.isStringLiteralLike(removeIn.initializer) || !/^\d+\.\d+\.\d+$/.test(removeIn.initializer.text)) {
      fail(`項目 ${id} の removeIn が 'X.Y.Z' の文字列ではない`);
    }
    return { id, removeIn: removeIn.initializer.text };
  });
};
const dueDeprecations = readDeprecations()
  .filter((entry) => compareVersions(next, entry.removeIn) >= 0)
  .map((entry) => `${entry.id}(${entry.removeIn} で消す)`);
if (dueDeprecations.length > 0) {
  console.error(
    `bump-version: ${next} で消す約束の非推奨が残っています: ${dueDeprecations.join(' / ')}。${DEPRECATIONS_PATH} の冒頭の手順どおりに消してから版を上げてください。`,
  );
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
const examplePackages = existsSync('examples')
  ? readdirSync('examples', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`examples/${entry.name}/package.json`))
      .map((entry) => `examples/${entry.name}/package.json`)
  : [];
for (const file of examplePackages) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.dependencies?.['@ishibashi0112/spreadsheet-grid'] === undefined) continue;
  pkg.dependencies['@ishibashi0112/spreadsheet-grid'] = `^${next}`;
  writeFileSync(file, JSON.stringify(pkg, null, 2));
  staged.push(file);
}
execSync(`git add ${staged.join(' ')}`);
execSync(`git commit -q -m "${next}"`);
// 注釈付きタグにします(`git push --follow-tags` は注釈付きタグしか push しない。pnpm version と同じ挙動)。
execSync(`git tag -a v${next} -m ${next}`);
console.log(`bumped ${current} -> ${next} (commit + tag v${next})`);