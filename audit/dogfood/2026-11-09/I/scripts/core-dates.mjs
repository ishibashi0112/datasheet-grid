import { readGridAskAnswer, describeGridAskView, createGridAskRequest } from '@ishibashi0112/spreadsheet-grid-core';
const columns = [
  { key: 'date', title: '日付', width: 100, filterType: 'dateSet' },
  { key: 'd2', title: '日付2', width: 100, filterType: 'date' },
  { key: 'amount', title: '金額', width: 100, filterType: 'number' },
  { key: 'st', title: '状態', width: 100, filterType: 'select', filterOptions: [{ value: 'a', label: 'あ' }, { value: '', label: 'すべて' }] },
  { key: 'auto1', title: '自動数', width: 100, filterType: 'auto', editor: { type: 'number' } },
  { key: 'auto2', title: '自動', width: 100, filterType: 'auto' },
  { key: 'cust', title: 'カスタム', width: 100, filterType: 'custom', filterFn: () => true },
];
const st = { version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] };
const A = (filters, extra = {}) => ({ mode: 'replace', filters, sort: null, search: null, hide: [], show: [], unsupported: null, ...extra });
const F = (column, op, value = null, values = null, to = null) => ({ column, op, value, values, to });
const tests = [
  ['slash date', [F('date', 'equals', '2026/11/1')]],
  ['jp date', [F('date', 'equals', '2026年11月1日')]],
  ['md only', [F('date', 'equals', '11/1')]],
  ['date w/ time', [F('date', 'onOrAfter', '2026-11-01T10:00:00Z')]],
  ['between reversed', [F('date', 'between', '2026-11-30', null, '2026-11-01')]],
  ['in dates', [F('date', 'in', null, ['2026/11/01', '2026-11-02'])]],
  ['date text col', [F('d2', 'contains', '2026/11')]],
  ['amount 1万', [F('amount', '>=', '1万')]],
  ['amount 10k', [F('amount', '>=', '10k')]],
  ['amount -5', [F('amount', '<', 'ー５')]],
  ['amount 1e3', [F('amount', '=', '1e3')]],
  ['select by label', [F('st', 'equals', 'あ')]],
  ['select empty', [F('st', 'equals', '')]],
  ['auto number', [F('auto1', '>=', '3')]],
  ['auto text', [F('auto2', '>=', '3')]],
  ['custom', [F('cust', 'contains', 'x')]],
  ['clear only', [F('amount', 'clear')]],
];
for (const [name, filters] of tests) {
  const r = readGridAskAnswer(A(filters), st, { columns });
  console.log(name.padEnd(18), r.ok ? JSON.stringify(r.state.filters.columnFilters) : r.message, r.ok ? JSON.stringify(r.dropped) : '');
}
const req = createGridAskRequest('x', st, { columns });
console.log(req.prompt.split('\n').filter((l) => l.startsWith('- ')).join('\n'));
// 列の見出しに " や改行
const odd = [{ key: 'q', title: '金額"税込"\nX', width: 80, filterType: 'number' }];
console.log(createGridAskRequest('x', st, { columns: odd }).prompt.split('\n').slice(1, 4).join('\n'));
