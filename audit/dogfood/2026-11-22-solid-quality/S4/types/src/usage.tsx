// 利用側の型の検査: 正しい書き方は通り、間違いは @ts-expect-error で型エラー
import { createSignal } from 'solid-js'
import {
  SpreadsheetGrid,
  createSpreadsheetGrid,
  standardFeatures,
  fillHandleFeature,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
  type CellRenderContext,
  type GridState,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-solid/testing'

type Row = { id: number; name: string; qty: number; price: number; tags?: string[] | undefined }

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 120 },
  {
    key: 'amount',
    title: '金額',
    width: 100,
    editable: false,
    getValue: (row) => row.qty * row.price, // row: Row
    valueFormatter: ({ value, row }) => {
      // グループ行・合計行では row が undefined
      const n: number | undefined = row?.qty
      void n
      return String(value)
    },
  },
  { key: 'qty', title: '数量', width: 80, editor: { type: 'number', min: 0, integer: true }, valueFormatter: numberFormatter() },
  {
    key: 'action',
    title: ' ',
    width: 80,
    renderCell: (ctx) => {
      const r: Row = ctx.row
      const active: boolean = ctx.isActive
      return <button onClick={() => ctx.setValue(r.name)}>{active ? '●' : ''}</button>
    },
    renderHeader: (ctx) => <span>{ctx.column.title}</span>,
  },
]

// @ts-expect-error valueGetter という名前は無い(getValue)
const bad1: GridColumn<Row> = { key: 'x', width: 10, valueGetter: (r: Row) => r.id }
// @ts-expect-error width は必須
const bad2: GridColumn<Row> = { key: 'x' }
// @ts-expect-error number エディタに options は無い
const bad3: GridColumn<Row> = { key: 'x', width: 10, editor: { type: 'number', options: [] } }
// @ts-expect-error getValue の row は Row(存在しないプロパティ)
const bad4: GridColumn<Row> = { key: 'x', width: 10, getValue: (r) => r.nope }
void bad1; void bad2; void bad3; void bad4

const renderCtx = (ctx: CellRenderContext<Row>) => ctx.rowKey
void renderCtx

export function App() {
  const [rows, setRows] = createSignal<Row[]>([])
  let grid!: SpreadsheetGridHandle<Row>
  let grid2: SpreadsheetGridHandle<Row> | undefined
  const height: number | undefined = Math.random() > 0.5 ? 400 : undefined
  const save = () => {
    const s: GridState = grid.getState()
    grid.applyState({ sort: s.sort })
    const selected: Row[] = grid.getSelectedRowData()
    grid.applyRows((prev) => prev.filter((r) => !selected.includes(r)))
    grid2?.scrollToRow(0, { align: 'center' })
  }
  void save
  return (
    <>
      <SpreadsheetGrid
        ref={grid}
        rows={rows()}
        columns={columns}
        onRowsChange={(next) => setRows(next)}
        rowKeyGetter={(row) => row.id}
        height={height}
        ariaLabel={undefined}
        localeText={localeTextEn}
      />
      <SpreadsheetGrid ref={(h) => (grid2 = h)} rows={rows()} columns={columns} rowKeyGetter={(row, i) => `${row.id}-${i}`} />
      {/* 列を直書きしたときも row は rows から推論される */}
      <SpreadsheetGrid rows={rows()} columns={[{ key: 'q', width: 80, getValue: (r) => r.qty * 2 }]} />
      {/* @ts-expect-error rowKeyGetter はオブジェクトを返せない */}
      <SpreadsheetGrid rows={rows()} columns={columns} rowKeyGetter={(row) => ({ id: row.id })} />
      {/* @ts-expect-error onRowsChange の引数は Row[] */}
      <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={(next: number[]) => void next} />
    </>
  )
}

const Lite = createSpreadsheetGrid({ features: { ...standardFeatures, fillHandle: fillHandleFeature } })
export function LiteApp() {
  return <Lite rows={[] as Row[]} columns={columns} fillHandle />
}

// props の型を利用側で使う
export type MyGridProps = Omit<SpreadsheetGridProps<Row>, 'columns'>
const restore = installJsdomLayoutStubs({ width: 800 })
void restore
