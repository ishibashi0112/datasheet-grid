// 追加(広報 2: StackBlitz のサンプル): examples/* を「今のコード」で型チェック + ビルドして、サンプルが壊れていないかを確かめます。
//   サンプルは StackBlitz でそのまま開けるよう npm の公開版(^X.Y.Z)に依存する単体の Vite プロジェクトなので、
//   ルートの tsc / eslint / vitest では依存ごとの確認ができません。ここでは各サンプルを一時ディレクトリへ写し、
//   公開版の代わりに pnpm pack した core / react の tarball を入れて `npm install` → `npm run build`(tsc + vite build)します。
//   あわせて、サンプルが依存する版の範囲が今の版(packages/react の version)と同じ ^X.Y.Z かを確かめます
//   (版上げのときは bump-version.mjs が書き換えます)。
//   使い方: build:lib の後に node scripts/check-examples.mjs [サンプル名 ...](CI でも実行。ネットワークが要る)
import { exec as execCallback, execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execCallback);
const root = resolve(import.meta.dirname, '..');
const examplesDir = join(root, 'examples');
const REACT_PACKAGE = '@ishibashi0112/spreadsheet-grid';
const CORE_PACKAGE = '@ishibashi0112/spreadsheet-grid-core';

const version = JSON.parse(readFileSync(join(root, 'packages/react/package.json'), 'utf8')).version;
const requested = process.argv.slice(2);
const names = readdirSync(examplesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => requested.length === 0 || requested.includes(name));
if (names.length === 0) {
  console.error('check-examples: 対象のサンプルがありません');
  process.exit(1);
}

// 版の範囲の確認(StackBlitz では公開版が入るので、今の版とずれていると古い版で動くことになる)
const mismatched = names.filter((name) => {
  const pkg = JSON.parse(readFileSync(join(examplesDir, name, 'package.json'), 'utf8'));
  return pkg.dependencies?.[REACT_PACKAGE] !== `^${version}`;
});
if (mismatched.length > 0) {
  console.error(`check-examples: ${mismatched.join(', ')} の ${REACT_PACKAGE} が ^${version} ではありません`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'ssg-examples-'));
try {
  // pnpm pack は workspace:* を X.Y.Z に変える(公開されるものと同じ tarball)
  const pack = (dir) => {
    const output = execSync(`pnpm pack --pack-destination "${work}"`, { cwd: join(root, dir) }).toString().trim();
    return output.split('\n').pop().trim();
  };
  const coreTarball = pack('packages/core');
  const reactTarball = pack('packages/react');
  // React 版は core の内部の部品を使うので、core には同じ版(workspace:* → X.Y.Z)で依存します(範囲になっていたら止める)
  const packedReact = JSON.parse(execSync(`tar -xzOf "${reactTarball}" package/package.json`).toString());
  if (packedReact.dependencies?.[CORE_PACKAGE] !== version) {
    console.error(
      `check-examples: pack した ${REACT_PACKAGE} の ${CORE_PACKAGE} への依存が ${packedReact.dependencies?.[CORE_PACKAGE]} です(同じ版 ${version} に固定します。packages/react/package.json は workspace:*)`,
    );
    process.exitCode = 1;
  }

  const results = await Promise.all(
    names.map(async (name) => {
      const dir = join(work, name);
      cpSync(join(examplesDir, name), dir, {
        recursive: true,
        filter: (source) => !/[\\/](node_modules|dist)$/.test(source) && !source.endsWith('package-lock.json'),
      });
      const pkgPath = join(dir, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      pkg.dependencies[REACT_PACKAGE] = `file:${reactTarball}`;
      pkg.dependencies[CORE_PACKAGE] = `file:${coreTarball}`;
      // react が依存する core(同じ版 X.Y.Z。まだ公開前の版のことがある)も tarball にそろえる
      pkg.overrides = { [CORE_PACKAGE]: `$${CORE_PACKAGE}` };
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      try {
        await exec('npm install --no-audit --no-fund --loglevel=error', { cwd: dir, maxBuffer: 64 * 1024 * 1024 });
        await exec('npm run build', { cwd: dir, maxBuffer: 64 * 1024 * 1024 });
        return { name, ok: true };
      } catch (error) {
        return { name, ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` || String(error) };
      }
    }),
  );

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} examples/${result.name}`);
    if (!result.ok) console.log(result.output);
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}