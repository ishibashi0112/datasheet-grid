import { createGridAskRequest } from '@ishibashi0112/spreadsheet-grid-core';
const regionOptions = [{ value: 'kanto', label: '関東' }, { value: 'kinki', label: '近畿' }];
const statusOptions = [{ value: 'paid', label: '入金済' }, { value: 'unpaid', label: '未入金' }, { value: 'cancelled', label: 'キャンセル' }];
const columns = [
  { key: 'date', title: '日付', width: 120, filterType: 'dateSet', editor: { type: 'date' } },
  { key: 'region', title: '地域', width: 100, filterType: 'set', filterOptions: regionOptions, editor: { type: 'select', options: regionOptions } },
  { key: 'rep', title: '担当', width: 120, filterType: 'textSet' },
  { key: 'qty', title: '数量', width: 80, filterType: 'number' },
  { key: 'amount', title: '金額', width: 120, filterType: 'numberSet' },
  { key: 'status', title: '状態', width: 110, filterType: 'select', filterOptions: statusOptions },
  { key: 'customer', title: '顧客', width: 100, filterType: 'text' },
  { key: 'memo', title: 'メモ', width: 160 },
];
const state = { version: 2, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] };
const req = createGridAskRequest('関東の 10 万円以上', state, { columns, columnHints: { amount: '円' } });
console.log('--- system ---\n' + req.system);
console.log('--- prompt ---\n' + req.prompt);
console.log('--- schema ---\n' + JSON.stringify(req.schema, null, 2));
