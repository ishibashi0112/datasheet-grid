// SSR で使う列と行(関数を含む列定義もサーバーで描く)
const columns = [
  { key: 'sku', title: 'SKU', width: 110, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 200, filterType: 'text' },
  { key: 'qty', title: '在庫数', width: 100, align: 'right', editor: { type: 'number', min: 0, integer: true }, filterType: 'number' },
  { key: 'price', title: '単価', width: 110, align: 'right', valueFormatter: ({ value }) => Number(value).toLocaleString('ja-JP') },
  { key: 'arrivedAt', title: '入荷日', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'total', title: '合計', width: 120, pinned: 'right', editable: false, getValue: (r) => r.qty * r.price, aggFunc: 'sum' },
]
const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}`, name: `品 ${i + 1}`, qty: i, price: 1000 + i, arrivedAt: '2026-11-01' }))
module.exports = { columns, rows }
