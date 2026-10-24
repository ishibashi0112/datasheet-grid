// 追加(差し込み式 段階 1): 利用側のバンドラで組み込んだときの JS の大きさを見積もり、上限(scripts/size-budget.json)と比べます。
//   条件: esbuild で束ねて minify / react・react-dom は外部化 / process.env.NODE_ENV = 'production' /
//   import.meta.env.DEV = false(公開 dist と同じく開発時だけの処理を落とす)/ splitting あり。
//   「初期」は入口のチャンク + そこから静的 import でたどれるチャンク、「遅延」は動的 import のチャンク(列フィルターの
//   ポップオーバー / ツールパネル)。gzip は zlib の level 9。ソース(packages/*/src)を直接束ねるのでビルドは不要です
//   (core は workspace のリンク + package.json の exports で src を指す)。
//   使い方: node scripts/measure-size.mjs           計測して表を出す
//           node scripts/measure-size.mjs --check   上限を超えた構成があれば終了コード 1(CI)
//           node scripts/measure-size.mjs --update  上限を「今の値 + 余裕」に書き直す(機能を足して大きくなったとき)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
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
    label: 'フル版(SpreadsheetGrid)',
    code: "export { SpreadsheetGrid } from './index.ts';",
  },
  // 差し込み式へ移行中の見張り: 機能セットを空にしたシェル。機能を移すたびに小さくなり、シェルへ機能の静的 import を
  //   戻してしまうと大きくなる(上限で検出)。/lite の入口ができたらそちらの構成に置き換える。
  {
    name: 'minimal',
    label: '機能セットなしのシェル(移行中)',
    code: "import { createSpreadsheetGrid } from './createSpreadsheetGrid.tsx'; export const Grid = createSpreadsheetGrid({ features: {} });",
  },
];

const kb = (bytes) => bytes / 1024;
const gzipBytes = (buf) => gzipSync(buf, { level: 9 }).length;

async function measure(config) {
  const result = await build({
    stdin: { contents: config.code, resolveDir: `${ROOT}packages/react/src`, loader: 'tsx', sourcefile: `size-${config.name}.tsx` },
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
  const concat = (keys) => Buffer.concat(keys.map((key) => Buffer.from(contentOf.get(absolute(key)) ?? new Uint8Array())));
  const jsKeys = Object.keys(outputs).filter((key) => key.endsWith('.js'));
  const initialBuf = concat([...initial]);
  const lazyBuf = concat(jsKeys.filter((key) => !initial.has(key)));
  return {
    initialMinKB: kb(initialBuf.length),
    initialGzipKB: kb(gzipBytes(initialBuf)),
    lazyGzipKB: lazyBuf.length > 0 ? kb(gzipBytes(lazyBuf)) : 0,
  };
}

const args = new Set(process.argv.slice(2));
const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
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

if (args.has('--update')) {
  const limits = {};
  for (const { config, size } of rows) {
    limits[config.name] = { initialGzipKB: Math.ceil((size.initialGzipKB + UPDATE_SLACK_KB) * 10) / 10 };
  }
  writeFileSync(BUDGET_PATH, JSON.stringify({ ...budget, limits }, null, 2));
  console.log(`\n上限を書き直しました: ${BUDGET_PATH}`);
}

if (args.has('--check')) {
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