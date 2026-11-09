import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import {
  REGIONS,
  REPS,
  STATUSES,
  WAREHOUSES,
  type CustomerRow,
  type KpiRow,
  type OrderRow,
  type SaleRow,
  type StockRow,
} from './data'

const yen = numberFormatter()

const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }))

export const salesColumns: GridColumn<SaleRow>[] = [
  { key: 'id', title: 'No.', width: 70, pinned: 'left', editable: false, align: 'right' },
  { key: 'customer', title: '顧客', width: 160, pinned: 'left', filterType: 'text' },
  { key: 'date', title: '受注日', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'region', title: '地域', width: 100, editor: { type: 'select', options: opts(REGIONS) }, filterType: 'set' },
  { key: 'product', title: '商品', width: 180, flex: 1, minWidth: 140 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number', min: 0, integer: true }, filterType: 'number' },
  { key: 'unitPrice', title: '単価', width: 110, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: yen },
  {
    key: 'status',
    title: '状態',
    width: 110,
    editor: { type: 'select', options: opts(STATUSES) },
    filterType: 'set',
    conditionalFormat: { chips: { 受注: 'info', 出荷済: 'neutral', 請求済: 'warning', 入金済: 'good', 取消: 'critical' } },
  },
  { key: 'paid', title: '入金', width: 70, editor: { type: 'checkbox' }, align: 'center' },
  { key: 'note', title: '備考', width: 220 },
  {
    key: 'amount',
    title: '金額',
    width: 130,
    pinned: 'right',
    align: 'right',
    editable: false,
    getValue: (row) => row.qty * row.unitPrice,
    valueFormatter: yen,
    aggFunc: 'sum',
  },
]

export const stockColumns: GridColumn<StockRow>[] = [
  { key: 'sku', title: 'SKU', width: 110, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 200 },
  { key: 'warehouse', title: '倉庫', width: 110, editor: { type: 'select', options: opts(WAREHOUSES) }, filterType: 'set' },
  { key: 'stock', title: '在庫数', width: 120, align: 'right', editor: { type: 'number', min: 0, integer: true }, conditionalFormat: { dataBar: { max: 1000 } } },
  { key: 'reorder', title: '発注点', width: 90, align: 'right', editor: { type: 'number', min: 0, integer: true } },
  { key: 'updatedAt', title: '更新日', width: 120, editor: { type: 'date' }, filterType: 'date' },
]

export const orderColumns: GridColumn<OrderRow>[] = [
  { key: 'orderNo', title: '受注番号', width: 130, pinned: 'left', editable: false },
  { key: 'orderedAt', title: '受注日', width: 110, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'customer', title: '顧客', width: 150, flex: 1, minWidth: 120 },
  { key: 'rep', title: '担当', width: 90, editor: { type: 'select', options: opts(REPS) }, filterType: 'set' },
  { key: 'amount', title: '金額', width: 120, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: yen, filterType: 'number' },
  { key: 'dueDate', title: '納期', width: 110, editor: { type: 'date' } },
  {
    key: 'priority',
    title: '優先度',
    width: 90,
    editor: { type: 'select', options: opts(['高', '中', '低']) },
    conditionalFormat: { chips: { 高: 'critical', 中: 'warning', 低: 'neutral' } },
  },
  { key: 'shipped', title: '出荷', width: 70, editor: { type: 'checkbox' }, align: 'center' },
]

export const kpiColumns: GridColumn<KpiRow>[] = [
  { key: 'rep', title: '担当', width: 90, pinned: 'left', editable: false },
  { key: 'target', title: '目標', width: 130, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: yen, aggFunc: 'sum' },
  { key: 'actual', title: '実績', width: 130, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: yen, aggFunc: 'sum', conditionalFormat: { dataBar: {} } },
  {
    key: 'rate',
    title: '達成率',
    width: 100,
    align: 'right',
    editable: false,
    getValue: (row) => Math.round((row.actual / row.target) * 1000) / 10,
    valueFormatter: ({ value }) => (typeof value === 'number' ? `${value.toFixed(1)}%` : ''),
  },
  { key: 'deals', title: '件数', width: 80, align: 'right', editor: { type: 'number', min: 0, integer: true }, aggFunc: 'sum' },
  { key: 'growth', title: '前年比 %', width: 100, align: 'right', editor: { type: 'number' }, conditionalFormat: { colorScale: { type: 'diverging', min: -30, mid: 0, max: 30 } } },
]

export const customerColumns: GridColumn<CustomerRow>[] = [
  { key: 'code', title: 'コード', width: 90, pinned: 'left', editable: false },
  { key: 'name', title: '顧客名', width: 200, filterType: 'text' },
  { key: 'region', title: '地域', width: 100, editor: { type: 'select', options: opts(REGIONS) }, filterType: 'set' },
  { key: 'rank', title: 'ランク', width: 80, editor: { type: 'select', options: opts(['S', 'A', 'B', 'C']) }, filterType: 'set' },
  { key: 'contractDate', title: '契約日', width: 130, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'active', title: '有効', width: 70, editor: { type: 'checkbox' }, align: 'center' },
  { key: 'memo', title: 'メモ', width: 200, flex: 1 },
]
