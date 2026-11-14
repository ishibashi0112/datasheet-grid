// サーバーとクライアントで同じものを描くための部品(JSX なし)
import { createElement as h, useState } from 'react'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'

export const columns = [
  { key: 'sku', title: 'SKU', width: 110, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 200, filterType: 'text' },
  { key: 'qty', title: '在庫数', width: 100, align: 'right', editor: { type: 'number', min: 0, integer: true }, filterType: 'number', aggFunc: 'sum' },
  { key: 'price', title: '単価', width: 110, align: 'right', valueFormatter: ({ value }) => Number(value).toLocaleString('ja-JP') },
  { key: 'arrivedAt', title: '入荷日', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'total', title: '合計', width: 120, pinned: 'right', editable: false, getValue: (r) => r.qty * r.price },
]
export const makeRows = () => Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}`, name: `品 ${i + 1}`, qty: i, price: 1000 + i, arrivedAt: '2026-11-01' }))

export const variants = {
  plain: {},
  themeClass: { theme: 'class' },
  themeAuto: { theme: 'auto' },
  totalRow: { totalRow: true },
  rowSelection: { enableRowSelection: true },
  initialState: { initialState: { sort: [{ columnKey: 'qty', direction: 'desc' }] } },
  find: { find: true, imeDirectInput: true },
  noPinned: { columnsOverride: columns.map(({ pinned, ...c }) => c) },
}

export function App({ variant = 'plain' }) {
  const [rows, setRows] = useState(makeRows)
  const { columnsOverride, ...props } = variants[variant]
  return h('main', null,
    h('h1', null, '在庫'),
    h('div', { style: { height: 500 } },
      h(SpreadsheetGrid, { rows, columns: columnsOverride ?? columns, onRowsChange: setRows, rowKeyGetter: (r) => r.id, height: '100%', ariaLabel: '在庫一覧', ...props })))
}
