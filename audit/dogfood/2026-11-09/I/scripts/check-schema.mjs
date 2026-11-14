import fs from 'node:fs';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import { createGridAskRequest } from '@ishibashi0112/spreadsheet-grid-core';

const log = JSON.parse(fs.readFileSync('requests.json', 'utf8'));
const schema = log[0].schema;

// 1. JSON Schema として正しいか(Ajv strict / draft-07 と 2020-12)
for (const [name, A] of [['draft-07', Ajv], ['2020-12', Ajv2020]]) {
  const ajv = new A({ strict: true, allErrors: true });
  try {
    ajv.compile(schema);
    console.log(name, 'compile ok');
  } catch (e) {
    console.log(name, 'compile NG', e.message);
  }
}

// 2. 構造化出力の制約
const problems = [];
const KNOWN = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'anyOf', 'description', 'const', '$defs', '$ref']);
const walk = (s, path) => {
  if (!s || typeof s !== 'object') return;
  for (const k of Object.keys(s)) if (!KNOWN.has(k)) problems.push(`${path}: keyword ${k}`);
  if (s.type === 'object') {
    if (s.additionalProperties !== false) problems.push(`${path}: additionalProperties != false`);
    const props = Object.keys(s.properties ?? {});
    const req = s.required ?? [];
    const missing = props.filter((p) => !req.includes(p));
    if (missing.length) problems.push(`${path}: not required ${missing}`);
    for (const p of props) walk(s.properties[p], `${path}.${p}`);
  }
  if (s.items) walk(s.items, `${path}[]`);
  if (s.anyOf) s.anyOf.forEach((x, i) => walk(x, `${path}|${i}`));
  if (Array.isArray(s.type)) problems.push(`${path}: type array`);
};
walk(schema, '$');
console.log('root type', schema.type, 'anyOf at root', !!schema.anyOf);
console.log('problems', problems.length ? problems : 'none');
// enum の数・ネストの深さ
let enumCount = 0, enumChars = 0, depth = 0;
const walk2 = (s, d) => {
  if (!s || typeof s !== 'object') return;
  depth = Math.max(depth, d);
  if (s.enum) { enumCount += s.enum.length; enumChars += s.enum.join('').length; }
  for (const v of Object.values(s.properties ?? {})) walk2(v, d + 1);
  if (s.items) walk2(s.items, d + 1);
  (s.anyOf ?? []).forEach((x) => walk2(x, d));
};
walk2(schema, 1);
console.log('enum values', enumCount, 'enum chars', enumChars, 'object depth', depth);

// 3. モックの答えが schema に合うか(自分のモックの確認)
const ajv = new Ajv({ strict: true, allErrors: true });
const validate = ajv.compile(schema);
for (const e of log) {
  const a = typeof e.answer === 'string' ? JSON.parse(e.answer) : e.answer;
  console.log('answer valid', e.text, validate(a), validate.errors?.map((x) => x.message));
}

// 4. 列が多い表(120 列)と 99 列 / 100 列 / 101 列での enum
const mk = (n) => Array.from({ length: n }, (_, i) => ({ key: `c${i}`, title: `列${i}`, width: 80, filterType: 'number' }));
const state = { version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] };
for (const n of [99, 100, 101, 120, 300]) {
  const r = createGridAskRequest('x', state, { columns: mk(n) });
  const col = r.schema.properties.filters.items.properties.column;
  let cnt = 0;
  const w = (s) => { if (!s || typeof s !== 'object') return; if (s.enum) cnt += s.enum.length; Object.values(s.properties ?? {}).forEach(w); if (s.items) w(s.items); (s.anyOf ?? []).forEach(w); };
  w(r.schema);
  console.log(n, 'cols: column enum?', !!col.enum, 'total enum values', cnt, 'prompt chars', r.prompt.length);
}
// 5. 列の key に記号・長い key
const odd = [{ key: 'a.b', title: 'ドット', width: 80, filterType: 'text' }, { key: '金額(税込)', title: '金額', width: 80, filterType: 'number' }, { key: '', title: '空', width: 80, filterType: 'text' }];
const r2 = createGridAskRequest('x', state, { columns: odd });
console.log('odd keys enum', JSON.stringify(r2.schema.properties.filters.items.properties.column));
