// 埋め込み用の在庫ウィジェット(Shadow DOM の中でも iframe の中でも同じ部品を使う)
import { createSignal } from 'solid-js'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridProps,
  type SpreadsheetGridHandle,
  type GridContextMenuItem,
  type GridContextMenuParams,
} from '@ishibashi0112/spreadsheet-grid-solid'

export type Item = {
  id: number
  code: string
  name: string
  category: string
  qty: number | null
  price: number
  arrivedAt: string
  status: string
  note: string
}

const CATEGORIES = ['文具', '日用品', '食品', '家電']
const STATUSES = ['販売中', '入荷待ち', '販売終了']
const NAMES = ['ボールペン', 'ノート', '付箋', '洗剤', 'タオル', '緑茶', 'コーヒー豆', '電気ケトル', 'ドライヤー', '電卓']

export function createItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    code: `P-${String(1000 + i)}`,
    name: `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1} 号(とても長い品名の例で、セルからはみ出す文字)`,
    category: CATEGORIES[i % CATEGORIES.length]!,
    qty: (i * 37) % 120,
    price: 100 + ((i * 53) % 40) * 25,
    arrivedAt: `2026-${String(1 + (i % 11)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
    status: STATUSES[i % 3]!,
    note: i % 5 === 0 ? '要確認' : '',
  }))
}

const options = (values: string[]) => values.map((value) => ({ value, label: value }))

export const columns: GridColumn<Item>[] = [
  { key: 'code', title: '品番', width: 90, pinned: 'left', filterType: 'text', editable: false },
  { key: 'name', title: '品名', width: 200, filterType: 'textSet', cellNote: ({ row }) => (row.note ? `メモ: ${row.note}` : undefined) },
  { key: 'category', title: 'カテゴリ', width: 100, editor: { type: 'select', options: options(CATEGORIES) }, filterType: 'set' },
  {
    key: 'qty',
    title: '在庫数',
    width: 90,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    valueFormatter: numberFormatter(),
    filterType: 'numberSet',
    aggFunc: 'sum',
    conditionalFormat: { dataBar: {} },
  },
  { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number', min: 0 }, valueFormatter: numberFormatter(), filterType: 'number' },
  { key: 'arrivedAt', title: '入荷日', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  {
    key: 'status',
    title: '状態',
    width: 110,
    editor: { type: 'select', options: options(STATUSES) },
    filterType: 'set',
    conditionalFormat: { chips: { 販売中: 'good', 入荷待ち: 'warning', 販売終了: 'critical' } },
  },
]

export type WidgetProps = {
  popupContainer?: SpreadsheetGridProps<Item>['popupContainer']
  theme?: 'light' | 'dark' | 'auto'
  onHandle?: (handle: SpreadsheetGridHandle<Item>) => void
}

export function StockWidget(props: WidgetProps) {
  const [rows, setRows] = createSignal(createItems(500))
  const [cols, setCols] = createSignal(columns)
  let grid: SpreadsheetGridHandle<Item> | undefined
  const contextItems = (params: GridContextMenuParams<Item>): GridContextMenuItem[] => {
    const items: GridContextMenuItem[] = [{ kind: 'label', label: '操作' }]
    if (params.target.type === 'cell') {
      const value = params.target.value
      items.push({ label: '値をコピー', icon: '📋', onSelect: () => void navigator.clipboard?.writeText(String(value ?? '')) })
    }
    const key = params.target.rowKey
    items.push({ kind: 'separator' })
    items.push({ label: 'この行を削除', danger: true, onSelect: () => setRows((cur) => cur.filter((r) => r.id !== key)) })
    items.push({ label: 'フィルターを管理…', onSelect: () => grid?.openFilterManager() })
    return items
  }
  return (
    <div class="stock-widget">
      <SpreadsheetGrid
        ref={(handle) => {
          grid = handle
          props.onHandle?.(handle)
        }}
        rows={rows()}
        columns={cols()}
        onColumnsChange={(next) => setCols(next)}
        onRowsChange={(next) => setRows(next)}
        rowKeyGetter={(row) => row.id}
        height="100%"
        theme={props.theme ?? 'light'}
        popupContainer={props.popupContainer}
        enableContextMenu
        getContextMenuItems={contextItems}
        fillHandle
        find
        totalRow
        imeDirectInput
        showCellOverflowTooltip
      />
    </div>
  )
}
