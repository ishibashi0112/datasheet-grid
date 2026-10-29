// 追加(差し込み式 段階 1): 利用側のバンドラで組み込んだときの JS の大きさを見積もり、上限(scripts/size-budget.json)と比べます。
//   条件: esbuild で束ねて minify / react・react-dom は外部化 / process.env.NODE_ENV = 'production' /
//   import.meta.env.DEV = false(公開 dist と同じく開発時だけの処理を落とす)/ splitting あり。
//   「初期」は入口のチャンク + そこから静的 import でたどれるチャンク、「遅延」は動的 import のチャンク(列フィルターの
//   ポップオーバー / ツールパネル)。gzip は zlib の level 9。
//   束ねる元は構成ごとに 2 通り:
//   - dist: 公開する dist(packages/react/dist + packages/core/dist。core は publishConfig の exports と同じく
//     dist/<サブパス>.js へ解決)。npm の利用者と同じ形で、先に build:lib が要ります(CI はビルドの後に実行)。
//   - src: ソース(packages/*/src)を直接。ビルド不要だが、モジュールの並び順が dist と違うため gzip が ±1KB ほど
//     揺れます(機能の部品を別ファイルへ移しただけで並びが変わる)。dist に入口が無い構成だけに使う(今は無し)。
//   使い方: node scripts/measure-size.mjs           計測して表を出す
//           node scripts/measure-size.mjs --check   上限を超えた構成があれば終了コード 1(CI)。dist がソースより
//                                                   古いときも 1(古い dist の値で通してしまわないため)。/lite の dist の
//                                                   形が崩れたとき(下の checkLiteDistShape)も 1
//           node scripts/measure-size.mjs --update  上限を「今の値 + 余裕」に書き直す(機能を足して大きくなったとき)
//           node scripts/measure-size.mjs --update=lite,standard   指定した構成の上限だけ書き直す(カンマ区切りで
//                                                   複数可。full は 112.3KB で固定しているので書き換えない)
//   どのディレクトリから実行しても同じ結果になります(esbuild の作業ディレクトリをリポジトリ直下に固定)。
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
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
  // 変更(差し込み式 段階 6): /lite の入口(公開 dist)。機能なしは本体だけの大きさで、本体へ機能の静的 import を
  //   戻してしまうと大きくなる(上限で検出)。standard はプリセット standardFeatures を差し込んだ構成。
  {
    name: 'lite',
    label: '/lite 機能なし(createSpreadsheetGrid のみ。公開 dist)',
    source: 'dist',
    code: "import { createSpreadsheetGrid } from './packages/react/dist/lite.js'; export const Grid = createSpreadsheetGrid({ features: {} });",
  },
  {
    name: 'standard',
    label: '/lite + standardFeatures(公開 dist)',
    source: 'dist',
    code: "import { createSpreadsheetGrid, standardFeatures } from './packages/react/dist/lite.js'; export const Grid = createSpreadsheetGrid({ features: standardFeatures });",
  },
  // 追加(ことばで絞り込み): 入口 /ai(GridAskBar だけ。グリッド本体は含まない)。/ai を使うと全部入りや /lite に足されるぶん。
  //   本体のモジュールを import して共有チャンクができると、ここが大きくなる(と同時に full の形も変わる)。
  {
    name: 'ai',
    label: '/ai(GridAskBar のみ。公開 dist)',
    source: 'dist',
    code: "export { GridAskBar } from './packages/react/dist/ai.js';",
  },
];

const kb = (bytes) => bytes / 1024;
const gzipBytes = (buf) => gzipSync(buf, { level: 9 }).length;

// dist の構成で、core のサブパス import を core の dist へ解決します(publishConfig の exports の `./internal/*` / `./*` と同じ)。
const CORE_PACKAGE = '@ishibashi0112/spreadsheet-grid-core';
const coreDistPlugin = {
  name: 'core-dist',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@ishibashi0112\/spreadsheet-grid-core(\/.*)?$/ }, (resolveArgs) => {
      const subpath = resolveArgs.path.slice(CORE_PACKAGE.length).replace(/^\/internal(?=\/)/, '');
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
      // React 版は全部入り(index)と /lite の 2 つのビルドなので、古い方で比べる。
      const entries = pkg === 'react' ? ['index.js', 'lite.js'] : ['index.js'];
      distMtime = Math.min(...entries.map((entry) => statSync(`${ROOT}packages/${pkg}/dist/${entry}`).mtimeMs));
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

// 追加(差し込み式 段階 6): /lite の dist の形を確かめ、崩れていれば理由を返します。esbuild のこの計測では見えないが、
//   Turbopack(Next.js 16 の既定)と webpack では使わない機能が利用側のバンドルに残る形への戻りを止めます
//   (vite.lite.config.ts の先頭も参照)。
//   1. 入口 dist/lite.js は import / export の文だけ(Turbopack は読み込んだモジュールの import をすべて残すので、
//      入口に中身があると入口が再エクスポートする全機能が残る)。
//   2. 本体(dist/lite/createSpreadsheetGrid.js)から静的 import でたどれるファイルに、機能の部品を定義するファイルが
//      無い(本体が機能のチャンクを import すると、Turbopack では使わなくても残る)。
//   3. プリセット(dist/lite/features/standard.js)は /* @__PURE__ */ 付きの呼び出しで作る(webpack はオブジェクト
//      リテラルを副作用なしと見なさず、standardFeatures を使わなくても 5 機能が残る)。
const LITE_DIST = `${ROOT}packages/react/dist/`;
const IMPORT_STATEMENT = /^import (?:\{([^}]*)\} from )?"([^"]+)";$/;
const EXPORT_STATEMENT = /^export \{([^}]*)\};$/;
const statementLines = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'));
// `a as b, c` → [[a, b], [c, c]]
const parseBindings = (list) =>
  list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const [imported, local = imported] = part.split(/\s+as\s+/);
      return [imported, local];
    });
// 相対パスの静的 import の { 解決後のパス, 取り込む名前の対応 } の一覧。
const relativeImports = (file) =>
  statementLines(file)
    .map((line) => IMPORT_STATEMENT.exec(line))
    .filter((match) => match !== null && match[2].startsWith('.'))
    .map((match) => ({ path: resolvePath(dirname(file), match[2]), bindings: parseBindings(match[1] ?? '') }));
const checkLiteDistShape = () => {
  const problems = [];
  const entryCode = statementLines(`${LITE_DIST}lite.js`).filter(
    (line) => !IMPORT_STATEMENT.test(line) && !EXPORT_STATEMENT.test(line),
  );
  if (entryCode.length > 0) {
    problems.push(`dist/lite.js に再エクスポート以外のコードがあります(先頭: ${entryCode[0].slice(0, 80)})`);
  }
  // 機能の部品を定義するファイル: dist/lite/features/<名前>.js が <名前>Feature を import して再エクスポートしていれば
  //   その import 先、自分で定義していればそのファイル。
  const featureDir = `${LITE_DIST}lite/features/`;
  const definingFiles = new Map();
  for (const fileName of readdirSync(featureDir).filter((name) => name.endsWith('.js') && name !== 'standard.js')) {
    const facade = `${featureDir}${fileName}`;
    const exportName = `${fileName.slice(0, -'.js'.length)}Feature`;
    const local = statementLines(facade)
      .map((line) => EXPORT_STATEMENT.exec(line))
      .filter((match) => match !== null)
      .flatMap((match) => parseBindings(match[1]))
      .find(([, exported]) => exported === exportName)?.[0];
    const source = relativeImports(facade).find(({ bindings }) => bindings.some(([, name]) => name === local));
    definingFiles.set(source ? source.path : facade, exportName);
  }
  const reachable = new Set();
  const walk = (file) => {
    if (reachable.has(file)) return;
    reachable.add(file);
    for (const { path } of relativeImports(file)) walk(path);
  };
  walk(`${LITE_DIST}lite/createSpreadsheetGrid.js`);
  for (const file of reachable) {
    if (definingFiles.has(file)) {
      problems.push(`/lite の本体が機能の部品(${definingFiles.get(file)})のファイルを静的 import しています`);
    }
  }
  if (!readFileSync(`${featureDir}standard.js`, 'utf8').includes('/* @__PURE__ */')) {
    problems.push('dist/lite/features/standard.js の standardFeatures が /* @__PURE__ */ 付きの呼び出しになっていません');
  }
  return problems;
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
  const liteProblems = checkLiteDistShape();
  if (liteProblems.length > 0) {
    for (const problem of liteProblems) {
      console.error(`size: ${problem}`);
    }
    console.error('/lite の dist の形は vite.lite.config.ts の先頭のコメントを参照してください。');
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