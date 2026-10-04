// 追加(audit P-1): 配布 d.ts の相対 import / export 指定子へ拡張子を付けます。
//   tsc は `from './SpreadsheetGrid'` のように拡張子なしで d.ts を出力しますが、両パッケージは
//   `"type": "module"` のため、利用側が `moduleResolution: node16 / nodenext` だと拡張子なしの相対指定子を
//   解決できず(TS2834 / TS2307)、skipLibCheck: true では無言で公開型が全部 any に潰れます。
//   ここで `./x` → `./x.js`(`./x.d.ts` がある場合)/ `./x/index.js`(`./x/index.d.ts` がある場合)へ
//   書き換えます(d.ts の `.js` 指定子は対応する `.d.ts` へ解決されます)。bundler 解決の利用側には影響しません。
// 実行: 各パッケージの build:lib(tsc -p tsconfig.lib.json の後)。引数は dist ディレクトリ(既定 'dist')。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
if (!existsSync(distDir)) {
  console.error(`fix-dts-extensions: ${distDir} がありません(tsc の後に実行してください)`);
  process.exit(1);
}

// `from './x'` / `from "../y"` / `import('./z')` / `export * from './w'` の相対指定子にマッチします
//   (すでに拡張子付き = `.js` / `.cjs` / `.mjs` / `.json` / `.css` で終わるものは対象外)。
const SPECIFIER = /((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*)\2/g;
const hasExtension = (specifier) => /\.(?:[cm]?js|json|css|d\.ts|ts|tsx)$/.test(specifier);

const rewriteFile = (file) => {
  const source = readFileSync(file, 'utf8');
  let changed = 0;
  const next = source.replace(SPECIFIER, (whole, lead, quote, specifier) => {
    if (hasExtension(specifier)) {
      return whole;
    }
    const base = resolve(dirname(file), specifier);
    let resolved = null;
    if (existsSync(`${base}.d.ts`)) {
      resolved = `${specifier}.js`;
    } else if (existsSync(join(base, 'index.d.ts'))) {
      resolved = `${specifier.replace(/\/$/, '')}/index.js`;
    }
    if (resolved === null) {
      return whole;
    }
    changed += 1;
    return `${lead}${quote}${resolved}${quote}`;
  });
  if (changed > 0) {
    writeFileSync(file, next);
  }
  return changed;
};

let files = 0;
let rewritten = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith('.d.ts')) {
      continue;
    }
    files += 1;
    rewritten += rewriteFile(full);
  }
};
walk(distDir);
console.log(`fix-dts-extensions: ${files} 個の d.ts を走査し、${rewritten} 箇所の相対指定子へ拡張子を付けました`);
