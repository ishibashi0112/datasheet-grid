// 追加(api-docs): 公開型(packages/core/src/model/gridTypes.core.ts)のフィールドへ、API_REFERENCE.md の表から
//   JSDoc(/** */)を生成して差し込みます。
//   目的: tsc の宣言出力は // コメントを落とすため、従来は npm の d.ts に prop の説明が一切出ていませんでした
//   (node_modules から使う AI / エディタのホバーに意味が届かない)。JSDoc は d.ts に残ります。
//   正本は API_REFERENCE.md の表です(利用者向けに書かれた説明)。型のフィールドを足したら表に行を足し、
//   本スクリプトで JSDoc を再生成します。// の開発メモ(追加(XX) 等の経緯)は触らず残します(d.ts には出ない)。
//   使い方(リポジトリ直下で):
//     node scripts/sync-api-jsdoc.mjs           … JSDoc を再生成して書き込む(pnpm run docs:jsdoc)
//     node scripts/sync-api-jsdoc.mjs --check   … ずれ / 表の過不足があれば exit 1(書き込まない)
//   同期は packages/core/src/model/gridTypes.apiDocs.test.ts(vp test)でも検査します。
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const REFERENCE_PATH = 'packages/react/API_REFERENCE.md';
export const SOURCE_PATH = 'packages/core/src/model/gridTypes.core.ts';

// JSDoc 行の折り返し幅(表示幅。全角 = 2)。
const WRAP_WIDTH = 100;

// 表 → 型の対応です。h2 / h3 は直近の見出し行、header は表の見出しセルです。
//   1 つの型に複数の表を対応させられます(SpreadsheetGridHandle はメソッド群の表が節ごとに分かれている)。
const TABLE_MAPPINGS = [
  {
    type: 'SpreadsheetGridProps',
    match: ({ h2, h3, header }) =>
      h2.includes('`SpreadsheetGridProps<T>`') && h3 === '' && header[0] === 'Name',
  },
  {
    type: 'GridContextMenuParams',
    match: ({ h3, header }) => h3.includes('コンテキストメニュー') && header[0] === 'フィールド',
  },
  {
    type: 'ScrollHintOptions',
    match: ({ h3, header }) => h3.includes('`scrollHint`') && header[0] === '項目',
  },
  {
    type: 'GridColumn',
    match: ({ h2, h3, header }) =>
      h2.includes('`GridColumn<T>`') && h3 === '' && header[0] === 'Name',
  },
  {
    type: 'DetailRowOptions',
    match: ({ h3, header }) => h3.includes('`detailRow`') && header[0] === 'Name',
  },
  {
    type: 'LabelRowOptions',
    match: ({ h3, header }) => h3.includes('`labelRow`') && header[0] === 'Name',
  },
  {
    type: 'SpreadsheetGridHandle',
    match: ({ h2, header }) => h2.includes('`SpreadsheetGridHandle<T>`') && header[0] === 'メソッド',
  },
  {
    type: 'GridClassNames',
    match: ({ h2, header }) => h2.includes('`classNames`') && header[0] === 'スロット',
  },
];

// 表に載せない内部フィールドの固定文言です(表との 1 対 1 検査の例外)。
const EXTRA_DOCS = {
  'GridColumn.__framework': {
    description: '型推論用の内部マーカーです(実行時には存在しません)。指定しないでください。',
  },
};

const DESCRIPTION_HEADERS = ['Description', '説明', '付与先'];
const DEFAULT_HEADERS = ['Default', '既定'];
const NO_DEFAULT = new Set(['', '—', '-', '(required)']);

// ── API_REFERENCE.md の表の読み取り ──────────────────────────────

const splitRow = (line) =>
  line
    .replace(/\\\|/g, '\u0000')
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim().replace(/\u0000/g, '|'));

export function parseTables(markdown) {
  const lines = markdown.split('\n');
  const tables = [];
  let h2 = '';
  let h3 = '';
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.startsWith('## ')) {
      h2 = line;
      h3 = '';
    } else if (line.startsWith('### ')) {
      h3 = line;
    }
    if (line.startsWith('|') && lines[i + 1]?.startsWith('| ---')) {
      const header = splitRow(line);
      const rows = [];
      let j = i + 2;
      for (; j < lines.length && lines[j].startsWith('|'); j++) {
        rows.push({ lineNumber: j + 1, cells: splitRow(lines[j]) });
      }
      tables.push({ h2, h3, header, rows });
      i = j - 1;
    }
  }
  return tables;
}

// 名前セル(`foo` / `bar()` / `baz(a, b)` 等)からフィールド名を取り出します。
const namesOf = (cell) =>
  [...cell.matchAll(/`([^`]+)`/g)]
    .map((m) => /^([A-Za-z_$][\w$]*)/.exec(m[1])?.[1])
    .filter((name) => name !== undefined);

// 表から「型名.フィールド名 → { description, defaultValue }」を作ります。
export function collectDocs(markdown) {
  const tables = parseTables(markdown);
  const docs = new Map();
  const errors = [];
  for (const mapping of TABLE_MAPPINGS) {
    const matched = tables.filter(mapping.match);
    if (matched.length === 0) {
      errors.push(`${REFERENCE_PATH}: ${mapping.type} の表が見つかりません(見出し / 表の見出し行を確認)`);
      continue;
    }
    for (const table of matched) {
      const descIndex = table.header.findIndex((h) => DESCRIPTION_HEADERS.includes(h));
      const defaultIndex = table.header.findIndex((h) => DEFAULT_HEADERS.includes(h));
      const isSlotTable = table.header[descIndex] === '付与先';
      for (const row of table.rows) {
        const names = namesOf(row.cells[0] ?? '');
        if (names.length === 0) {
          errors.push(`${REFERENCE_PATH}:${row.lineNumber}: 名前セルからフィールド名を読めません`);
          continue;
        }
        let description = row.cells[descIndex] ?? '';
        if (isSlotTable) description = `付与先: ${description}`;
        // 複数のフィールドを 1 行で説明している行は、どれの説明か分かるよう名前セルを前置します。
        if (names.length > 1) description = `${row.cells[0]}: ${description}`;
        const rawDefault = defaultIndex >= 0 ? (row.cells[defaultIndex] ?? '') : '';
        // `—` のようにコード表記された「既定なし」も既定なしとして扱います。
        const defaultValue = NO_DEFAULT.has(rawDefault.replace(/`/g, '')) ? undefined : rawDefault;
        for (const name of names) {
          const key = `${mapping.type}.${name}`;
          if (docs.has(key)) {
            errors.push(`${REFERENCE_PATH}:${row.lineNumber}: ${key} が複数の行にあります`);
            continue;
          }
          docs.set(key, { description, defaultValue });
        }
      }
    }
  }
  return { docs, errors };
}

// ── JSDoc の整形 ──────────────────────────────────────────────

const isWide = (cp) =>
  cp >= 0x1100 &&
  (cp <= 0x115f ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6));

const displayWidth = (text) => {
  let width = 0;
  for (const ch of text) width += isWide(ch.codePointAt(0)) ? 2 : 1;
  return width;
};

// この句読点の直後と半角スペースの位置で折り返します(`code` の中では折り返しません)。
const BREAK_AFTER = new Set(['。', '、', ')', '」', ',']);
// 行頭に来ると Markdown / JSDoc タグとして解釈され得る文字と、行頭禁則の句読点 / 閉じ括弧では行を始めません。
const BAD_LINE_START = /^([@\-*+#>|。、,.:;)」)]|\d+[.)])/;

const breakCandidates = (text) => {
  const candidates = [];
  let inCode = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '`') inCode = !inCode;
    if (inCode) continue;
    if (ch === ' ') candidates.push({ cut: i, resume: i + 1 });
    else if (BREAK_AFTER.has(ch)) candidates.push({ cut: i + 1, resume: i + 1 });
  }
  return candidates;
};

export function wrapText(text, maxWidth) {
  const lines = [];
  let rest = text.trim();
  while (displayWidth(rest) > maxWidth) {
    let chosen;
    for (const candidate of breakCandidates(rest)) {
      const line = rest.slice(0, candidate.cut).trimEnd();
      const next = rest.slice(candidate.resume).trimStart();
      if (line === '' || next === '' || BAD_LINE_START.test(next)) continue;
      if (displayWidth(line) <= maxWidth) {
        chosen = candidate;
      } else {
        // 幅内に候補が無いときは、幅を超える最初の候補で折ります(長い `code` 等)。
        chosen ??= candidate;
        break;
      }
    }
    if (chosen === undefined) break;
    lines.push(rest.slice(0, chosen.cut).trimEnd());
    rest = rest.slice(chosen.resume).trimStart();
  }
  lines.push(rest);
  return lines;
}

const escapeComment = (text) => text.replace(/\*\//g, '*\\/');

export function renderJsdoc(indent, { description, defaultValue }) {
  const body = escapeComment(description);
  const single = `${indent}/** ${body} */`;
  if (defaultValue === undefined && displayWidth(single) <= WRAP_WIDTH) {
    return single;
  }
  const prefix = `${indent} * `;
  const lines = [`${indent}/**`];
  for (const line of wrapText(body, WRAP_WIDTH - displayWidth(prefix))) {
    lines.push(`${prefix}${line}`);
  }
  if (defaultValue !== undefined) {
    lines.push(`${indent} *`, `${prefix}@defaultValue ${escapeComment(defaultValue)}`);
  }
  lines.push(`${indent} */`);
  return lines.join('\n');
}

// ── gridTypes.core.ts への適用 ───────────────────────────────

// reference(API_REFERENCE.md の中身)と source(gridTypes.core.ts の中身)から、JSDoc を同期した
//   source を返します。errors は表と型の過不足、changedMembers は JSDoc が変わる(= ずれている)フィールドです。
export function syncApiJsdoc(reference, source) {
  const { docs, errors } = collectDocs(reference);
  const sourceFile = ts.createSourceFile(
    SOURCE_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const edits = [];
  const changedMembers = [];
  for (const type of new Set(TABLE_MAPPINGS.map((mapping) => mapping.type))) {
    const alias = sourceFile.statements.find(
      (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === type,
    );
    if (alias === undefined || !ts.isTypeLiteralNode(alias.type)) {
      errors.push(`${SOURCE_PATH}: 型 ${type}(オブジェクト型リテラル)が見つかりません`);
      continue;
    }
    const seen = new Set();
    for (const member of alias.type.members) {
      if (!(ts.isPropertySignature(member) || ts.isMethodSignature(member))) continue;
      const name = member.name.getText(sourceFile);
      const key = `${type}.${name}`;
      seen.add(name);
      const doc = docs.get(key) ?? EXTRA_DOCS[key];
      if (doc === undefined) {
        errors.push(`${REFERENCE_PATH}: ${type} の表に \`${name}\` の行がありません(表に追加してから再生成)`);
        continue;
      }
      const start = member.getStart(sourceFile);
      const lineStart = source.lastIndexOf('\n', start - 1) + 1;
      const indent = source.slice(lineStart, start);
      const block = `${renderJsdoc(indent, doc)}\n`;
      // 直前(空白のみを挟む)の /** */ を生成済み JSDoc とみなして置き換えます。
      const ranges = ts.getLeadingCommentRanges(source, member.pos) ?? [];
      const last = ranges.at(-1);
      const hasJsdoc =
        last !== undefined &&
        source.startsWith('/**', last.pos) &&
        source.slice(last.end, start).trim() === '';
      const from = hasJsdoc ? source.lastIndexOf('\n', last.pos - 1) + 1 : lineStart;
      if (source.slice(from, lineStart) !== block) {
        changedMembers.push(key);
        edits.push({ from, to: lineStart, text: block });
      }
    }
    for (const key of docs.keys()) {
      const [docType, name] = key.split('.');
      if (docType === type && !seen.has(name)) {
        errors.push(`${REFERENCE_PATH}: ${type} の表の \`${name}\` は型にありません(行を削除するか型を確認)`);
      }
    }
  }
  let output = source;
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    output = output.slice(0, edit.from) + edit.text + output.slice(edit.to);
  }
  return { output, errors, changedMembers };
}

// ── CLI ──────────────────────────────────────────────────────

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const check = process.argv.includes('--check');
  const reference = readFileSync(REFERENCE_PATH, 'utf8');
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const { output, errors, changedMembers } = syncApiJsdoc(reference, source);
  if (errors.length > 0) {
    console.error(`sync-api-jsdoc: 表と型が対応していません(${errors.length} 件)\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  if (changedMembers.length === 0) {
    console.log('sync-api-jsdoc: JSDoc は API_REFERENCE.md と同期済みです');
    process.exit(0);
  }
  if (check) {
    console.error(
      `sync-api-jsdoc: JSDoc が API_REFERENCE.md とずれています(${changedMembers.length} 件)。` +
        `pnpm run docs:jsdoc で再生成してください\n- ${changedMembers.join('\n- ')}`,
    );
    process.exit(1);
  }
  writeFileSync(SOURCE_PATH, output);
  console.log(`sync-api-jsdoc: ${changedMembers.length} フィールドの JSDoc を更新しました`);
}