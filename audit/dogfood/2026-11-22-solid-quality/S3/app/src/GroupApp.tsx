// カテゴリで行をグループ化した商品マスタ(?grid=group)。
// ほかの担当者が登録した商品が「新着」として上のグループへ届く(window.__insertTop / ボタン / ?autoinsert=ms)。
import { createSignal, For, onSettled } from 'solid-js'
import {
  createSpreadsheetGrid,
  standardFeatures,
  groupingFeature,
  findFeature,
  contextMenuFeature,
  type GridColumn,
  type SpreadsheetGridHandle,
  numberFormatter,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { createProduct, createRows, SUPPLIER_BY_CODE, type Product } from './data'
import { SupplierEditor } from './SupplierEditor'

const GroupGrid = createSpreadsheetGrid({
  features: { ...standardFeatures, grouping: groupingFeature, find: findFeature, contextMenu: contextMenuFeature },
})

const params = new URLSearchParams(location.search)

type GRow = Product & { description: string }

const columns: GridColumn<GRow>[] = [
  { key: 'category', title: 'カテゴリ', width: 100, rowGroup: true, editable: false },
  { key: 'sku', title: 'SKU', width: 110, editable: false },
  { key: 'name', title: '商品名', width: 180 },
  {
    key: 'price',
    title: '価格',
    width: 100,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    valueFormatter: numberFormatter({ maximumFractionDigits: 0 }),
    aggFunc: 'avg',
  },
  { key: 'stock', title: '在庫', width: 90, align: 'right', editor: { type: 'number', min: 0, integer: true }, aggFunc: 'sum' },
  { key: 'releasedAt', title: '発売日', width: 130, editor: { type: 'date' } },
  { key: 'description', title: '説明', width: 240, editor: { type: 'text', multiline: true } },
  {
    key: 'supplier',
    title: '仕入先',
    width: 170,
    editor: { type: 'custom', render: (ctx) => <SupplierEditor ctx={ctx as any} /> },
    valueFormatter: ({ value }) => SUPPLIER_BY_CODE.get(String(value ?? ''))?.name ?? String(value ?? ''),
  },
]

let serial = 90000
export function GroupApp() {
  const initial = createRows(600).filter((r): r is Product => r.kind === 'product').map((r) => ({ ...r, description: '' }))
  const [rows, setRows] = createSignal<GRow[]>(initial)
  const [log, setLog] = createSignal<string[]>([])
  let grid!: SpreadsheetGridHandle<GRow>
  const push = (line: string) => setLog((l) => [line, ...l].slice(0, 8))
  const insertTop = (category = '文具') => {
    const p = createProduct(++serial, category)
    setRows((prev) => [{ ...p, description: '' }, ...prev])
    push(`新着: ${p.id}(${category})`)
  }
  const w = window as any
  w.__insertTop = insertTop
  w.__rows = rows
  w.__grid = () => grid
  let auto = 0
  w.__auto = (ms: number) => { clearInterval(auto); if (ms) auto = window.setInterval(() => insertTop(), ms) }
  onSettled(() => {
    const ms = Number(params.get('autoinsert') ?? 0)
    if (!ms) return
    const id = setInterval(() => insertTop(), ms)
    return () => clearInterval(id)
  })
  return (
    <div class="box-border flex h-full flex-col gap-2 p-3">
      <header class="flex items-center gap-2">
        <h1 class="mr-2 text-lg font-bold">商品マスタ(カテゴリ別)</h1>
        <span class="text-sm text-muted-foreground" data-testid="count">{rows().length} 件</span>
        <button class="rounded-md border px-3 py-1 text-sm" data-testid="insert" onClick={() => insertTop()}>
          新着を取り込む
        </button>
      </header>
      <div class="min-h-0 flex-1">
        <GroupGrid
          ref={grid}
          rows={rows()}
          columns={columns}
          onRowsChange={(next) => setRows(next)}
          rowKeyGetter={(row) => row.id}
          activeCellFollows={params.get('follows') === 'row' ? 'row' : 'position'}
          find
          enableContextMenu
          theme="class"
          height="100%"
        />
      </div>
      <ul class="h-20 overflow-auto rounded border p-1 font-mono text-xs" data-testid="log">
        <For each={log()}>{(line) => <li>{line}</li>}</For>
      </ul>
    </div>
  )
}
