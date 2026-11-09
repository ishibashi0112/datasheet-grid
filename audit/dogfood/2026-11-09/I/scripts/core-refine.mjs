import { readGridAskAnswer } from '@ishibashi0112/spreadsheet-grid-core';
const columns = [
  { key: 'amount', title: '金額', width: 100, filterType: 'numberSet' },
  { key: 'qty', title: '数量', width: 100, filterType: 'number' },
  { key: 'date', title: '日付', width: 100, filterType: 'dateSet' },
];
const st = { version: 2, columnWidths: {}, filters: { globalText: '田中', columnFilters: {
  amount: { kind: 'numberSet', condition: { mode: 'comparison', operator: '>=', value: 100 }, set: { mode: 'include', values: ['100', '200', '300'] } },
  qty: { kind: 'number', raw: '5 以上', parsed: { mode: 'comparison', operator: '>=', value: 5 } },
} }, sort: [{ columnKey: 'qty', direction: 'desc' }] };
const A = (filters, extra = {}) => ({ mode: 'refine', filters, sort: null, search: null, hide: [], show: [], unsupported: null, ...extra });
const F = (column, op, value = null, values = null, to = null) => ({ column, op, value, values, to });
const show = (name, r) => console.log(name.padEnd(22), JSON.stringify(r.state.filters), JSON.stringify(r.state.sort), r.changed, JSON.stringify(r.dropped));
show('refine clear qty', readGridAskAnswer(A([F('qty', 'clear')]), st, { columns }));
show('refine cond only', readGridAskAnswer(A([F('amount', '<', '1000')]), st, { columns }));
show('refine set only', readGridAskAnswer(A([F('amount', 'in', null, ['100'])]), st, { columns }));
show('refine search ""', readGridAskAnswer(A([], { search: '' }), st, { columns }));
show('refine sort []', readGridAskAnswer(A([], { sort: [] }), st, { columns }));
show('refine sort bad', readGridAskAnswer(A([], { sort: [{ column: 'nope', direction: 'asc' }] }), st, { columns }));
show('replace keep nothing', readGridAskAnswer({ ...A([]), mode: 'replace' }, st, { columns }));
show('mode missing', readGridAskAnswer({ filters: [F('qty', '>', '1')] }, st, { columns }));
const r = readGridAskAnswer({ mode: 'Replace', filters: [] }, st, { columns });
console.log('mode Replace (caps)', r.ok ? JSON.stringify(r.state.filters) : r.message);
const r2 = readGridAskAnswer({ mode: 'something', filters: [] }, st, { columns });
console.log('mode bogus', r2.ok ? JSON.stringify(r2.state.filters) + ' changed=' + r2.changed : r2.message);
