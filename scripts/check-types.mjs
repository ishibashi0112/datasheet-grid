// 追加(1.0 の準備): 公開型の型テストです。利用者が実際に読む d.ts(pack した tarball)を、利用側の形で tsc にかけます。
//   src ではなく公開物を見るので、d.ts の書き出し方・exports の型の対応・core の内部のパスの漏れが分かります。
//   - type-tests/src: 正しい書き方が通り、間違いが型エラーになる(@ts-expect-error)ことの検査。
//   - type-tests/library と、すべての入口の値(関数は呼び出した結果も)と公開型のプロパティを推論のまま再公開する
//     生成ファイル: d.ts を出すライブラリの形。
//     tsc が型に名前を付けられる(TS2883 / TS2742 にならない)こと、出した d.ts が core の内部のパス(/internal/)や
//     dist のパスを指さないことを確かめる。portable.tsx は React 版だけに依存する形(pnpm で core を直接入れない)でも通す。
//   - type-tests/cjs: CommonJS のファイルから nodenext で読む形。
//   組み合わせ: TypeScript は対応の下限・リポジトリの版・最新、React の型は 19(npm)と 18(pnpm)、
//   解決方式は bundler と nodenext。TypeScript の対応範囲を変えたら MIN_TYPESCRIPT とドキュメント(README /
//   docs/versioning)をそろえる。
//   使い方: build:lib の後に node scripts/check-types.mjs(CI でも実行。ネットワークが要る)
import { exec as execCallback, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execCallback);
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

const REACT_PACKAGE = '@ishibashi0112/spreadsheet-grid';
const CORE_PACKAGE = '@ishibashi0112/spreadsheet-grid-core';
// 公開する入口(package.json の exports のうち JS のもの)。
const ENTRIES = ['', '/lite', '/ai', '/locales/en', '/testing'];
// 対応する TypeScript の下限と、確かめる最新の版(上げるときはここを書き換える)。
const MIN_TYPESCRIPT = '5.8.3';
const LATEST_TYPESCRIPT = '7.0.2';
const REPO_TYPESCRIPT = ts.version;

const work = mkdtempSync(join(tmpdir(), 'ssg-types-'));
const results = [];
const record = (name, ok, output = '') => {
  results.push({ name, ok, output });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok && output) console.log(output.trim());
};

// d.ts の検査: core の内部のパスと dist のパスを探す。
const findLeaks = (dir) => {
  const leaks = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.cts')) {
        const text = readFileSync(path, 'utf8');
        for (const match of text.matchAll(/(?:import\(|from |\/\/\/ <reference (?:types|path)=)["']([^"']+)["']/g)) {
          const specifier = match[1];
          if (/\/internal\/|\/dist\/|node_modules|\.pnpm/.test(specifier)) {
            leaks.push(`${relative(dir, path)}: ${specifier}`);
          }
        }
      }
    }
  };
  walk(dir);
  return leaks;
};

const runTsc = async (name, cwd, tscPath, config, { emitDir } = {}) => {
  const configPath = join(cwd, `tsconfig.${name.replace(/[^a-z0-9]+/gi, '-')}.json`);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  try {
    await exec(`node "${tscPath}" -p "${configPath}"`, { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    record(name, false, `${error.stdout ?? ''}${error.stderr ?? ''}` || String(error));
    return;
  }
  if (emitDir) {
    const leaks = findLeaks(emitDir);
    if (leaks.length > 0) {
      record(name, false, `d.ts が内部のパスを指しています:\n${leaks.join('\n')}`);
      return;
    }
  }
  record(name, true);
};

// すべての入口の値の export を、推論のまま再公開するファイルを作る(d.ts を出すライブラリの形)。
//   変更(レビュー): 関数の宣言は d.ts で `typeof e0.X` と書かれて中身が展開されないので、呼び出した結果も再公開する。
//   公開している型(型の別名 / interface)は、型引数を any にしてプロパティを 1 段たどった値も再公開する
//   (/ai の GridAskOptions の columns が内部の束縛で書かれていたのを、これで見つけた)。
const writeExportsFile = (projectDir, file) => {
  const stub = join(projectDir, 'library', '__entries.ts');
  writeFileSync(stub, ENTRIES.map((entry, i) => `import * as e${i} from '${REACT_PACKAGE}${entry}';\nexport { e${i} };`).join('\n'));
  const program = ts.createProgram([stub], {
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(stub);
  const lines = ['// check-types.mjs が作るファイルです(すべての入口の値と型を推論のまま再公開する)。'];
  const counts = { values: 0, calls: 0, types: 0, properties: 0 };
  const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
  // オブジェクトの形の型だけをたどる(文字列のリテラルの和などは String のメソッドが出るだけなので見ない)。
  //   配列は Array のメソッドが出るだけなので見ない(要素の型は、その型を公開していればそちらでたどる)。
  const isObjectLike = (type) =>
    type.isUnion()
      ? type.types.every(isObjectLike)
      : (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) !== 0 &&
        !checker.isArrayType(type) &&
        !checker.isTupleType(type);
  source.statements.forEach((statement, i) => {
    if (!ts.isImportDeclaration(statement)) return;
    const moduleSymbol = checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (!moduleSymbol) throw new Error(`入口を解決できません: ${statement.moduleSpecifier.getText()}`);
    const specifier = statement.moduleSpecifier.text;
    const index = i / 2;
    lines.push(`import * as e${index} from '${specifier}';`);
    let entryValues = 0;
    for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const id = `e${index}_${symbol.name.replace(/[^A-Za-z0-9_]/g, '_')}`;
      if (target.flags & ts.SymbolFlags.Value) {
        lines.push(`export const ${id} = e${index}.${symbol.name};`);
        counts.values += 1;
        entryValues += 1;
        if (target.flags & ts.SymbolFlags.Function) {
          lines.push(`export const ${id}__call = (...args: Parameters<typeof e${index}.${symbol.name}>) => e${index}.${symbol.name}(...args);`);
          counts.calls += 1;
        }
      }
      const typeDeclaration = target.declarations?.find(
        (declaration) => ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration),
      );
      if (typeDeclaration !== undefined) {
        const typeArguments = typeDeclaration.typeParameters?.map(() => 'any') ?? [];
        const reference = `e${index}.${symbol.name}${typeArguments.length > 0 ? `<${typeArguments.join(', ')}>` : ''}`;
        const declaredType = checker.getDeclaredTypeOfSymbol(target);
        const properties = isObjectLike(declaredType)
          ? checker.getPropertiesOfType(declaredType).filter((property) => IDENTIFIER.test(property.name))
          : [];
        if (properties.length > 0) {
          lines.push(`declare const t_${id}: ${reference};`);
          for (const property of properties) {
            lines.push(`export const ${id}__${property.name} = t_${id}.${property.name};`);
          }
          counts.types += 1;
          counts.properties += properties.length;
        }
      }
    }
    if (entryValues === 0) throw new Error(`入口 ${specifier} から値を 1 つも読めません(解決を確かめる)`);
  });
  rmSync(stub);
  // 何も見ていないのに通る、を防ぐ下限(入口の公開物が大きく減ったら見直す)。
  if (counts.values < 40 || counts.properties < 1000) {
    throw new Error(`再公開した数が少なすぎます(値 ${counts.values} / プロパティ ${counts.properties})`);
  }
  writeFileSync(join(projectDir, 'library', file), lines.join('\n'));
  return counts;
};

const baseOptions = {
  target: 'ES2022',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  jsx: 'react-jsx',
  strict: true,
  skipLibCheck: false,
  noEmit: true,
  types: [],
};

try {
  // pnpm pack は workspace:* を X.Y.Z に変える(公開されるものと同じ tarball)
  const pack = (dir) => {
    const output = execSync(`pnpm pack --pack-destination "${work}"`, { cwd: join(root, dir) }).toString().trim();
    return output.split('\n').pop().trim();
  };
  const coreTarball = pack('packages/core');
  const reactTarball = pack('packages/react');

  const copyTests = (dir) => {
    cpSync(join(root, 'type-tests'), dir, { recursive: true, filter: (source) => !/[\\/](node_modules|out)$/.test(source) });
  };

  // ── npm + React 19 の型(core も直接の依存に入れる = withCore.tsx の前提)──
  const npmDir = join(work, 'npm');
  mkdirSync(npmDir);
  copyTests(npmDir);
  writeFileSync(
    join(npmDir, 'package.json'),
    JSON.stringify(
      {
        name: 'ssg-type-tests-npm',
        private: true,
        type: 'module',
        dependencies: {
          react: '^19.2.0',
          'react-dom': '^19.2.0',
          [REACT_PACKAGE]: `file:${reactTarball}`,
          [CORE_PACKAGE]: `file:${coreTarball}`,
        },
        devDependencies: {
          '@types/react': '^19.2.0',
          '@types/react-dom': '^19.2.0',
          typescript: REPO_TYPESCRIPT,
          'ts-min': `npm:typescript@${MIN_TYPESCRIPT}`,
          'ts-latest': `npm:typescript@${LATEST_TYPESCRIPT}`,
        },
        // react が依存する core(同じ版 X.Y.Z。まだ公開前の版のことがある)も tarball にそろえる
        overrides: { [CORE_PACKAGE]: `$${CORE_PACKAGE}` },
      },
      null,
      2,
    ),
  );
  // ── pnpm + React 18 の型(React 版だけに依存。core は React 版の依存として入る)──
  const pnpmDir = join(work, 'pnpm');
  mkdirSync(pnpmDir);
  copyTests(pnpmDir);
  writeFileSync(
    join(pnpmDir, 'package.json'),
    JSON.stringify(
      {
        name: 'ssg-type-tests-pnpm',
        private: true,
        type: 'module',
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', [REACT_PACKAGE]: `file:${reactTarball}` },
        devDependencies: { '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0', typescript: REPO_TYPESCRIPT },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(pnpmDir, 'pnpm-workspace.yaml'), `overrides:\n  '${CORE_PACKAGE}': 'file:${coreTarball}'\n`);

  await Promise.all([
    exec('npm install --no-audit --no-fund --loglevel=error', { cwd: npmDir, maxBuffer: 64 * 1024 * 1024 }),
    exec('pnpm install --reporter=silent', { cwd: pnpmDir, maxBuffer: 64 * 1024 * 1024 }),
  ]);
  const generated = writeExportsFile(npmDir, 'generatedExports.ts');
  cpSync(join(npmDir, 'library', 'generatedExports.ts'), join(pnpmDir, 'library', 'generatedExports.ts'));
  console.log(
    `check-types: 入口 ${ENTRIES.length} つの値 ${generated.values} 個(関数の呼び出し ${generated.calls} 個)と、` +
      `型 ${generated.types} 個のプロパティ ${generated.properties} 個を再公開して確かめます`,
  );

  const tsc = (dir, pkg) => join(dir, 'node_modules', pkg, 'bin', 'tsc');
  const bundler = { ...baseOptions, module: 'ESNext', moduleResolution: 'bundler' };
  const nodenext = { ...baseOptions, module: 'nodenext', moduleResolution: 'nodenext' };
  const emit = (outDir) => ({ noEmit: false, declaration: true, emitDeclarationOnly: true, outDir, rootDir: 'library' });

  const checks = [];
  for (const [label, pkg] of [
    [`TypeScript ${MIN_TYPESCRIPT}`, 'ts-min'],
    [`TypeScript ${REPO_TYPESCRIPT}`, 'typescript'],
    [`TypeScript ${LATEST_TYPESCRIPT}`, 'ts-latest'],
  ]) {
    const slug = pkg;
    checks.push(() => runTsc(`npm / React 19 / bundler / ${label}: 型の検査`, npmDir, tsc(npmDir, pkg), { compilerOptions: bundler, include: ['src'] }));
    checks.push(() =>
      runTsc(
        `npm / React 19 / bundler / ${label}: ライブラリの d.ts`,
        npmDir,
        tsc(npmDir, pkg),
        { compilerOptions: { ...bundler, ...emit(`out/${slug}`) }, include: ['library'] },
        { emitDir: join(npmDir, 'out', slug) },
      ),
    );
    checks.push(() => runTsc(`npm / React 19 / nodenext(ESM と CommonJS)/ ${label}`, npmDir, tsc(npmDir, pkg), { compilerOptions: nodenext, include: ['src', 'cjs'] }));
  }
  checks.push(() => runTsc('pnpm / React 18 / bundler: 型の検査', pnpmDir, tsc(pnpmDir, 'typescript'), { compilerOptions: bundler, include: ['src'] }));
  checks.push(() =>
    runTsc(
      'pnpm / React 18 / bundler: core を直接入れないライブラリの d.ts',
      pnpmDir,
      tsc(pnpmDir, 'typescript'),
      { compilerOptions: { ...bundler, ...emit('out/portable') }, files: ['library/portable.tsx'] },
      { emitDir: join(pnpmDir, 'out', 'portable') },
    ),
  );
  for (const check of checks) {
    await check();
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}