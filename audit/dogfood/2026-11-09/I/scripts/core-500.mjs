import { createGridAskRequest, readGridAskAnswer, describeGridAskView } from '@ishibashi0112/spreadsheet-grid-core';
const columns = [
  { key: 'customer', title: '顧客', width: 100, filterType: 'set' },
  { key: 'amount', title: '金額', width: 100, filterType: 'numberSet' },
];
const vals = Array.from({ length: 600 }, (_, i) => `C-${10001 + i}`);
const state = { version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: { customer: { kind: 'set', mode: 'include', values: vals } } }, sort: [] };
const req = createGridAskRequest('さらに C-20000 も', state, { columns });
const cv = req.prompt.split('\n').find((l) => l.startsWith('Current view'));
const parsed = JSON.parse(cv.slice('Current view: '.length));
console.log('current view filter values sent:', parsed.filters[0].values.length, 'more:', parsed.filters[0].more);
// refine: 送られた 500 件 + 1 件
const ans = { mode: 'refine', filters: [{ column: 'customer', op: 'in', value: null, values: [...parsed.filters[0].values, 'C-20000'], to: null }], sort: null, search: null, hide: [], show: [], unsupported: null };
const r = readGridAskAnswer(ans, state, { columns });
console.log('refine ok', r.ok, 'values', r.state.filters.columnFilters.customer.values.length, 'dropped', r.dropped);
// replace: 500 件をすべて書き直し + 1
const r2 = readGridAskAnswer({ ...ans, mode: 'replace' }, state, { columns });
console.log('replace values', r2.state.filters.columnFilters.customer.values.length);
// replace: 1 件だけ
const r3 = readGridAskAnswer({ ...ans, mode: 'replace', filters: [{ ...ans.filters[0], values: ['C-20000'] }] }, state, { columns });
console.log('replace one', r3.state.filters.columnFilters.customer.values);
// 値を数で返す(numberSet の in で数値の文字列 '100.00')
const st2 = { ...state, filters: { globalText: '', columnFilters: {} } };
const r4 = readGridAskAnswer({ mode: 'replace', filters: [{ column: 'amount', op: 'in', value: null, values: ['100.00', '１，２００'], to: null }], sort: null, search: null, hide: [], show: [], unsupported: null }, st2, { columns });
console.log('numberSet in', JSON.stringify(r4.state.filters.columnFilters.amount), r4.dropped);
// 見出しで列を指定 + 同じ見出しが 2 列
const dupCols = [...columns, { key: 'amount2', title: '金額', width: 100, filterType: 'number' }];
const r5 = readGridAskAnswer({ mode: 'replace', filters: [{ column: '金額', op: '>=', value: '5', values: null, to: null }], sort: null, search: null, hide: [], show: [], unsupported: null }, st2, { columns: dupCols });
console.log('dup title', JSON.stringify(r5.state.filters.columnFilters), r5.dropped);
console.log(describeGridAskView(r4.state, { columns }));
