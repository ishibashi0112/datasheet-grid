import { createMemo, createSignal, For, Show } from 'solid-js'
import {
  SpreadsheetGrid,
  type SpreadsheetGridHandle,
  type RowDropParams,
  type GridContextMenuParams,
  type GridContextMenuItem,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { createRows, isLabel, type CategoryLabel, type Row } from './data'
import { createColumns, labelRow } from './columns'
import { ProductGrid, ProductGridNoFill, ProductGridBare } from './grid'

const params = new URLSearchParams(location.search)
const variant = params.get('grid') ?? 'lite' // lite | nofill | mixed | full

const columns = createColumns()

export function App() {
  const [rows, setRows] = createSignal<Row[]>(createRows())
  const [log, setLog] = createSignal<string[]>([])
  const [dark, setDark] = createSignal(false)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  let grid: SpreadsheetGridHandle<Row> | undefined
  let dialogGrid!: SpreadsheetGridHandle<Row>
  let dialog!: HTMLDialogElement

  const push = (line: string) => setLog((l) => [line, ...l].slice(0, 8))

  // ラベル行(カテゴリ)のまとまりの中だけで動かす
  const sectionOf = createMemo(() => {
    const map = new Map<string, string>()
    let section = ''
    for (const row of rows()) {
      if (isLabel(row)) section = row.id
      else map.set(row.id, section)
    }
    return map
  })
  const canDropRow = ({ row, rowAbove }: RowDropParams<Row>) =>
    rowAbove !== undefined && (isLabel(rowAbove) ? rowAbove.id : sectionOf().get(rowAbove.id)) === sectionOf().get(row.id)

  const productCount = createMemo(() => rows().filter((r) => !isLabel(r)).length)

  const toggleDark = () => {
    const next = !dark()
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  const openDialog = () => {
    setDialogOpen(true)
    dialog.showModal()
  }

  const Grid = variant === 'nofill' ? ProductGridNoFill : variant === 'bare' ? ProductGridBare : ProductGrid

  const gridProps = () => ({
    rows: rows(),
    columns,
    onRowsChange: (next: Row[]) => setRows(next),
    rowKeyGetter: (row: Row) => row.id,
    labelRow,
    enableRowDrag: true,
    canDropRow,
    onRowMove: (p: { rowKey: unknown; fromIndex: number; toIndex: number }) =>
      push(`行を移動: ${String(p.rowKey)} ${p.fromIndex} → ${p.toIndex}`),
    find: true,
    fillHandle: true,
    enableContextMenu: true,
    getContextMenuItems: (p: GridContextMenuParams<Row>): GridContextMenuItem[] => {
      const row = p.target.row
      if (!row || isLabel(row)) return []
      return [
        { kind: 'label', label: row.name },
        {
          id: 'dup',
          label: 'この行を複製',
          onSelect: () => {
            const h = grid
            h?.applyRows((prev) => {
              const i = prev.findIndex((r) => r.id === row.id)
              const copy = { ...row, id: `${row.id}-c${Date.now() % 100000}`, sku: `${row.sku}-C` }
              return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]
            })
            push(`複製: ${row.id}`)
          },
        },
        { kind: 'separator' },
        {
          id: 'del',
          label: 'この行を削除',
          danger: true,
          onSelect: () => {
            grid?.applyRows((prev) => prev.filter((r) => r.id !== row.id))
            push(`削除: ${row.id}`)
          },
        },
      ]
    },
    theme: 'class' as const,
    showRowNumbers: true,
    onPasteSkipped: (p: { cells: { message?: string | undefined }[] }) =>
      push(`貼り付けで ${p.cells.length} セルは書きませんでした(${p.cells[0]?.message ?? '編集できないセル'})`),
  })

  return (
    <div class="box-border flex h-full flex-col gap-2 p-3">
      <header class="flex flex-wrap items-center gap-2">
        <h1 class="mr-2 text-lg font-bold">商品マスタ</h1>
        <span class="text-sm text-muted-foreground" data-testid="count">
          {productCount()} 件
        </span>
        <span class="rounded border px-1 text-xs" data-testid="variant">{variant}</span>
        <button class="rounded-md border px-3 py-1 text-sm hover:bg-accent" onClick={() => grid?.openFind()}>
          検索
        </button>
        <button
          class="rounded-md border px-3 py-1 text-sm hover:bg-accent"
          data-testid="csv"
          onClick={() => {
            const csv = grid?.exportCsv({ includeLabelRows: true }) ?? ''
            ;(window as any).__csv = csv
            push(`CSV: ${csv.split('\n').length} 行`)
          }}
        >
          CSV を作る
        </button>
        <button class="rounded-md border px-3 py-1 text-sm hover:bg-accent" data-testid="dark" onClick={toggleDark}>
          {dark() ? 'ライト' : 'ダーク'}
        </button>
        <button class="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground" data-testid="open-dialog" onClick={openDialog}>
          ダイアログで開く
        </button>
      </header>

      <div class="min-h-0 flex-1" data-testid="main-grid">
        <Show when={!params.has('nomain')}>
        <Show
          when={variant !== 'full'}
          fallback={
            <SpreadsheetGrid<Row, CategoryLabel>
              ref={(h) => (grid = h)}
              {...gridProps()}
              height="100%"
            />
          }
        >
          <Show
            when={params.has('nospread')}
            fallback={<Grid<Row, CategoryLabel> ref={(h) => (grid = h)} {...gridProps()} height="100%" />}
          >
            <Grid<Row, CategoryLabel>
              ref={(h) => (grid = h)}
              rows={rows()}
              columns={columns}
              onRowsChange={(next) => setRows(next)}
              rowKeyGetter={(row) => row.id}
              labelRow={labelRow}
              enableRowDrag
              canDropRow={canDropRow}
              find
              fillHandle
              enableContextMenu
              theme="class"
              height="100%"
            />
          </Show>
        </Show>
        </Show>
      </div>

      <Show when={variant === 'mixed'}>
        <div class="h-64" data-testid="mixed-grid">
          <SpreadsheetGrid<Row, CategoryLabel> {...gridProps()} height="100%" />
        </div>
      </Show>

      <ul class="h-20 overflow-auto rounded border p-1 font-mono text-xs" data-testid="log">
        <For each={log()}>{(line) => <li>{line}</li>}</For>
      </ul>

      <dialog
        ref={dialog}
        class="m-auto w-[900px] max-w-[95vw] rounded-lg border bg-background p-4 text-foreground backdrop:bg-black/40"
        onClose={() => setDialogOpen(false)}
        data-testid="dialog"
      >
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-bold">商品を選んで編集</h2>
          <button class="rounded-md border px-3 py-1 text-sm" onClick={() => dialog.close()}>
            閉じる
          </button>
        </div>
        <Show when={dialogOpen()}>
          <div class="h-[420px]" data-testid="dialog-grid">
            <Grid<Row, CategoryLabel> ref={dialogGrid} {...gridProps()} height="100%" />
          </div>
        </Show>
      </dialog>
    </div>
  )
}
