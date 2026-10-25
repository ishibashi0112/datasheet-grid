// 追加(差し込み式 段階 1): 利用側のバンドラで組み込んだときの JS の大きさを見積もり、上限(scripts/size-budget.json)と比べます。
//   条件: esbuild で束ねて minify / react・react-dom は外部化 / process.env.NODE_ENV = 'production' /
//   import.meta.env.DEV = false(公開 dist と同じく開発時だけの処理を落とす)/ splitting あり。
//   「初期」は入口のチャンク + そこから静的 import でたどれるチャンク、「遅延」は動的 import のチャンク(列フィルターの
//   ポップオーバー / ツールパネル)。gzip は zlib の level 9。
//   束ねる元は構成ごとに 2 通り:
//   - dist: 公開する dist(packages/react/dist + packages/core/dist。core は publishConfig の exports と同じく
//     dist/<サブパス>.js へ解決)。npm の利用者と同じ形で、先に build:lib が要ります(CI はビルドの後に実行)。
//   - src: ソース(packages/*/src)を直接。ビルド不要だが、モジュールの並び順が dist と違うため gzip が ±1KB ほど
//     揺れます(機能の部品を別ファイルへ移しただけで並びが変わる)。dist に入口が無い構成(移行中の機能セットなし)だけに使う。
//   使い方: node scripts/measure-size.mjs           計測して表を出す
//           node scripts/measure-size.mjs --check   上限を超えた構成があれば終了コード 1(CI)。dist がソースより
//                                                   古いときも 1(古い dist の値で通してしまわないため)
//           node scripts/measure-size.mjs --update  上限を「今の値 + 余裕」に書き直す(機能を足して大きくなったとき)
//           node scripts/measure-size.mjs --update=minimal   指定した構成の上限だけ書き直す(カンマ区切りで複数可。
//                                                   移行中は full を固定し minimal だけ詰める)
//   どのディレクトリから実行しても同じ結果になります(esbuild の作業ディレクトリをリポジトリ直下に固定)。
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUDGET_PATH = fileURLToPath(new URL('./size-budget.json', import.meta.url));
// --update で上限に足す余裕(KB)。gzip の実装差(Node / zlib の版)で数十バイト揺れる分を吸収します。
const UPDATE_SLACK_KB = 0.5;

// 計測する構成。code は利用側のコードに相当し、packages/react/src から解決します。
const CONFIGS = [
  {
    name: 'full',
    label: 'フル版(SpreadsheetGrid。公開 dist)',
    source: 'dist',
    code: "export { SpreadsheetGrid } from './packages/react/dist/index.js';",
  },
  // 差し込み式へ移行中の見張り: 機能セットを空にしたシェル。機能を移すたびに小さくなり、シェルへ機能の静的 import を
  //   戻してしまうと大きくなる(上限で検出)。/lite の入口ができたらそちらの構成に置き換える。
  {
    name: 'minimal',
    label: '機能セットなしのシェル(移行中。src)',
    source: 'src',
    code: "import { createSpreadsheetGrid } from './createSpreadsheetGrid.tsx'; export const Grid = createSpreadsheetGrid({ features: {} });",
  },
];

const kb = (bytes) => bytes / 1024;
const gzipBytes = (buf) => gzipSync(buf, { level: 9 }).length;

// dist の構成で、core のサブパス import を core の dist へ解決します(publishConfig の exports の `./*` と同じ)。
const CORE_PACKAGE = '@ishibashi0112/spreadsheet-grid-core';
const coreDistPlugin = {
  name: 'core-dist',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@ishibashi0112\/spreadsheet-grid-core(\/.*)?$/ }, (resolveArgs) => {
      const subpath = resolveArgs.path.slice(CORE_PACKAGE.length);
      return { path: `${ROOT}packages/core/dist${subpath === '' ? '/index' : subpath}.js` };
    });
  },
};

// dist がソースより古いかを調べます(ビルドし忘れの計測を防ぐ)。パッケージごと(core / react)に、ソースの
//   うちビルドに入るファイル(テスト・テスト用の補助・.md を除く)の最新の更新時刻と dist の入口を比べます。
const isBuildSource = (name) => /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name);
const newestMtime = (dir) => {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(path));
    } else if (isBuildSource(entry.name)) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
};
// 古いパッケージの名前を返します(dist が無ければ終了)。
const findStaleDists = () => {
  const stale = [];
  for (const pkg of ['core', 'react']) {
    let distMtime;
    try {
      distMtime = statSync(`${ROOT}packages/${pkg}/dist/index.js`).mtimeMs;
    } catch {
      console.error(`size: packages/${pkg}/dist がありません。先に \`pnpm run build:lib\` を実行してください。`);
      process.exit(1);
    }
    if (newestMtime(`${ROOT}packages/${pkg}/src`) > distMtime) {
      stale.push(pkg);
    }
  }
  return stale;
};

async function measure(config) {
  const fromDist = config.source === 'dist';
  const result = await build({
    // metafile の出力パスは作業ディレクトリ基準の相対パスになるため、リポジトリ直下に固定します(下の absolute)。
    absWorkingDir: ROOT,
    stdin: fromDist
      ? { contents: config.code, resolveDir: ROOT, loader: 'js', sourcefile: `size-${config.name}.js` }
      : { contents: config.code, resolveDir: `${ROOT}packages/react/src`, loader: 'tsx', sourcefile: `size-${config.name}.tsx` },
    plugins: fromDist ? [coreDistPlugin] : [],
    bundle: true,
    minify: true,
    format: 'esm',
    splitting: true,
    write: false,
    metafile: true,
    outdir: `${ROOT}.size-out`,
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/*', 'react-dom/*'],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
    loader: { '.css': 'empty' },
    logLevel: 'error',
  });
  const outputs = result.metafile.outputs;
  const contentOf = new Map(result.outputFiles.map((file) => [file.path, file.contents]));
  const absolute = (key) => `${ROOT}${key}`;
  const entryKey = Object.keys(outputs).find((key) => outputs[key].entryPoint !== undefined);
  const initial = new Set();
  const walk = (key) => {
    if (initial.has(key)) return;
    initial.add(key);
    for (const imported of outputs[key].imports) {
      if (imported.kind === 'import-statement' && outputs[imported.path]) walk(imported.path);
    }
  };
  walk(entryKey);
  const concat = (keys) =>
    Buffer.concat(
      keys.map((key) => {
        const content = contentOf.get(absolute(key));
        // 見つからないまま 0 バイトとして数えると、上限を黙って通してしまうため止めます。
        if (content === undefined) {
          throw new Error(`size: 出力 ${key} の中身が見つかりません(パスの解決がずれています)`);
        }
        return Buffer.from(content);
      }),
    );
  // 遅延分は初期 JS から動的 import でたどれるチャンクだけを数えます。esbuild は使われなくなった動的 import の
  //   チャンク(機能セットに無い遅延部品)も出力するため、出力をすべて数えると読み込まれない分まで入ってしまう。
  const reachable = new Set();
  const walkLazy = (key) => {
    if (reachable.has(key)) return;
    reachable.add(key);
    for (const imported of outputs[key].imports) {
      if ((imported.kind === 'import-statement' || imported.kind === 'dynamic-import') && outputs[imported.path]) {
        walkLazy(imported.path);
      }
    }
  };
  walkLazy(entryKey);
  const initialBuf = concat([...initial]);
  const lazyBuf = concat([...reachable].filter((key) => key.endsWith('.js') && !initial.has(key)));
  return {
    initialMinKB: kb(initialBuf.length),
    initialGzipKB: kb(gzipBytes(initialBuf)),
    lazyGzipKB: lazyBuf.length > 0 ? kb(gzipBytes(lazyBuf)) : 0,
  };
}

const argv = process.argv.slice(2);
const args = new Set(argv);
// --update(全部)/ --update=a,b(指定した構成だけ)。
const updateArg = argv.find((arg) => arg === '--update' || arg.startsWith('--update='));
const updateTargets =
  updateArg === undefined ? null : updateArg === '--update' ? CONFIGS.map((config) => config.name) : updateArg.slice('--update='.length).split(',');
if (updateTargets) {
  const unknown = updateTargets.filter((name) => !CONFIGS.some((config) => config.name === name));
  if (unknown.length > 0) {
    console.error(`size: --update の構成名が不明です: ${unknown.join(', ')}`);
    process.exit(1);
  }
}
const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
const staleDists = CONFIGS.some((config) => config.source === 'dist') ? findStaleDists() : [];
if (staleDists.length > 0) {
  console.warn(
    `size: 警告 — dist がソースより古いです(${staleDists.join(', ')})。\`pnpm run build:lib\` をやり直すと正しい値になります。`,
  );
}
const rows = [];
for (const config of CONFIGS) {
  rows.push({ config, size: await measure(config), limit: budget.limits?.[config.name]?.initialGzipKB });
}

const fmt = (value) => (value === undefined ? '-' : `${value.toFixed(2)} KB`);
console.log('バンドルサイズ(esbuild / minify / react 外部化 / gzip level 9)');
// 日本語は表示幅が揃わないので、説明(label)は最後の列に置きます。
console.log(['config'.padEnd(12), 'init gzip'.padStart(12), 'limit'.padStart(12), 'init min'.padStart(12), 'lazy gzip'.padStart(12), '  説明'].join(''));
for (const { config, size, limit } of rows) {
  console.log(
    [
      config.name.padEnd(12),
      fmt(size.initialGzipKB).padStart(12),
      fmt(limit).padStart(12),
      fmt(size.initialMinKB).padStart(12),
      fmt(size.lazyGzipKB).padStart(12),
      `  ${config.label}`,
    ].join(''),
  );
}

if (updateTargets) {
  const limits = { ...budget.limits };
  for (const { config, size } of rows) {
    if (updateTargets.includes(config.name)) {
      limits[config.name] = { initialGzipKB: Math.ceil((size.initialGzipKB + UPDATE_SLACK_KB) * 10) / 10 };
    }
  }
  writeFileSync(BUDGET_PATH, JSON.stringify({ ...budget, limits }, null, 2));
  console.log(`\n上限を書き直しました(${updateTargets.join(', ')}): ${BUDGET_PATH}`);
}

if (args.has('--check')) {
  if (staleDists.length > 0) {
    console.error('size: dist が古いままでは正しく測れません。`pnpm run build:lib` の後に実行してください。');
    process.exit(1);
  }
  const over = rows.filter(({ size, limit }) => limit === undefined || size.initialGzipKB > limit);
  if (over.length > 0) {
    for (const { config, size, limit } of over) {
      console.error(
        limit === undefined
          ? `size: 構成 ${config.name} の上限が scripts/size-budget.json にありません`
          : `size: 構成 ${config.name} の初期 JS が上限を超えました(${size.initialGzipKB.toFixed(2)} KB > ${limit} KB)`,
      );
    }
    console.error('意図した増加なら `node scripts/measure-size.mjs --update` で上限を更新し、理由をコミットに書いてください。');
    process.exit(1);
  }
}