// CI の solid-latest のジョブ(Solid 版の測り直し 段階 4 の 1-4): Solid 版の Solid を範囲 ^2 の中の最新へ上げ、実際に読む版を出す。
//   ロックファイルの版(Solid 2.0.0 = Solid 版が対応する下限)は上の ci のジョブが回すので、こちらは新しい方の端を回す。
//   - packages/solid の devDependencies で版を固定している solid-js / @solidjs/web / @solidjs/babel-plugin は、npm の公開版から
//     2.x の最新(公開から 2 日たったもの。pnpm の minimumReleaseAge で入らない新しすぎる版を避ける)を選んで pnpm add する
//     (範囲で add / update すると、ロックファイルの版が範囲に入っているのでそのまま残る)。
//   - 間接の依存の @solidjs/signals(solid-js から)と @solidjs/compiler(@solidjs/vite-plugin から)は pnpm update で上げる。
//   node scripts/solid-latest.mjs          # 上げてから版を出す
//   node scripts/solid-latest.mjs --print  # 今の版を出すだけ
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const PINNED = ['solid-js', '@solidjs/web', '@solidjs/babel-plugin'];
const TRANSITIVE = ['@solidjs/signals', '@solidjs/compiler'];

const compare = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
};

function newestMature(name) {
  const time = JSON.parse(execFileSync('npm', ['view', name, 'time', '--json'], { encoding: 'utf8' }));
  const versions = Object.entries(time)
    .filter(([version, published]) => /^2\.\d+\.\d+$/.test(version) && Date.now() - Date.parse(published) > MIN_AGE_MS)
    .map(([version]) => version)
    .sort(compare);
  const newest = versions.at(-1);
  if (!newest) throw new Error(`${name} の 2.x の公開版が見つかりません`);
  return newest;
}

function versionOf(name, from) {
  const entry = from.resolve(name);
  const root = entry.slice(0, entry.lastIndexOf('/node_modules/') + '/node_modules/'.length) + name;
  return JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).version;
}

function print() {
  const solidPackage = createRequire(new URL('../packages/solid/package.json', import.meta.url));
  const fromSolidJs = createRequire(solidPackage.resolve('solid-js'));
  const fromVitePlugin = createRequire(solidPackage.resolve('@solidjs/vite-plugin'));
  console.log(`solid-js: ${versionOf('solid-js', solidPackage)}`);
  console.log(`@solidjs/web: ${versionOf('@solidjs/web', solidPackage)}`);
  console.log(`@solidjs/signals(solid-js から): ${versionOf('@solidjs/signals', fromSolidJs)}`);
  console.log(`@solidjs/compiler(@solidjs/vite-plugin から): ${versionOf('@solidjs/compiler', fromVitePlugin)}`);
  console.log(`@solidjs/babel-plugin: ${versionOf('@solidjs/babel-plugin', solidPackage)}`);
}

if (!process.argv.includes('--print')) {
  const specs = PINNED.map((name) => `${name}@${newestMature(name)}`);
  console.log(`上げる版: ${specs.join(' ')}`);
  execFileSync('pnpm', ['--filter', './packages/solid', 'add', '-D', ...specs], { stdio: 'inherit' });
  execFileSync('pnpm', ['-r', 'update', '--depth', 'Infinity', ...TRANSITIVE], { stdio: 'inherit' });
}
print();