import { useRef, useState } from 'react'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
  type ServerSideDataSource,
  type GridContextMenuItem,
} from '@ishibashi0112/spreadsheet-grid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en'

type Row = { id: number; name: string; qty: number | null; price: number; tags?: string[] }
type Other = { code: string }
type Label = { kind: 'label'; id: string; title: string }

// 1. 列の基本
export const ok: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200 },
  // getValue の row は Row
  { key: 'amount', width: 100, editable: false, getValue: (row) => (row.qty ?? 0) * row.price },
  // valueFormatter の row は Row | undefined
  { key: 'price', width: 100, valueFormatter: ({ value, row }) => `${row?.name}:${String(value)}` },
  // setValue は新しい行を返す
  { key: 'name2', width: 100, getValue: (r) => r.name, setValue: (r, v) => ({ ...r, name: String(v) }) },
  { key: 'qty', width: 80, editor: { type: 'number', min: 0, integer: true }, validate: ({ value, row }) => (row.price > 0 && Number(value) >= 0) || '0 以上' },
  { key: 'cat', width: 80, editor: { type: 'select', options: [{ value: 'a', label: 'A' }] }, filterOptions: [{ value: 'a', label: 'A' }] as const },
  { key: 'r', width: 80, renderCell: ({ row, value }) => <b title={row.name}>{String(value)}</b> },
  { key: 'c', width: 80, cellClassName: ({ row }) => ((row.qty ?? 0) < 0 ? 'neg' : undefined) },
  { key: 'agg', width: 80, aggFunc: 'sum' },
  { key: 'fmt', width: 80, valueFormatter: numberFormatter() },
]

// 2. 間違いが型エラーになるか
export const errs: GridColumn<Row>[] = [
  // @ts-expect-error width は必須
  { key: 'name' },
  // @ts-expect-error number エディタに options は無い
  { key: 'qty', width: 80, editor: { type: 'number', options: [] } },
  // @ts-expect-error select エディタには options が要る
  { key: 'qty', width: 80, editor: { type: 'select' } },
  // @ts-expect-error valueFormatter は文字列を返す
  { key: 'x', width: 80, valueFormatter: () => 1 },
  // @ts-expect-error 行に無いプロパティ
  { key: 'x', width: 80, getValue: (row) => row.nope },
  // @ts-expect-error valueFormatter の row は undefined かもしれない
  { key: 'x', width: 80, valueFormatter: ({ row }) => row.name },
  // @ts-expect-error pinned は left / right
  { key: 'x', width: 80, pinned: 'center' },
  // @ts-expect-error filterType の打ち間違い
  { key: 'x', width: 80, filterType: 'txt' },
]

// 3. key の打ち間違いは型では捕まらない(key は string)。ここはエラーにならないことを確かめるだけ
export const typoKey: GridColumn<Row>[] = [{ key: 'nmae', width: 100 }]

export function Grids() {
  const [rows, setRows] = useState<Row[]>([])
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null)
  const otherRef = useRef<SpreadsheetGridHandle<Other>>(null)
  const selected: Row[] = gridRef.current?.getSelectedRowData() ?? []
  void selected
  const ds: ServerSideDataSource<Row> = {
    getRows: async ({ startIndex, endIndex, query, signal }) => {
      void signal
      void query.sort
      return { rows: rows.slice(startIndex, endIndex), totalRowCount: rows.length }
    },
  }
  const menu = (): GridContextMenuItem[] => [{ kind: 'action', id: 'x', label: 'X', onSelect: () => {} }]
  void menu
  return (
    <>
      {/* 4. 列をインラインで書いても row が Row に推論される */}
      <SpreadsheetGrid
        rows={rows}
        columns={[
          { key: 'name', width: 100, getValue: (r) => r.name.toUpperCase() },
          { key: 'p', width: 100, valueFormatter: ({ row }) => row?.price.toFixed(0) ?? '' },
        ]}
        onRowsChange={setRows}
        rowKeyGetter={(r) => r.id}
        ref={gridRef}
        canEditCell={(_ri, _ci, row, column) => row.price > 0 && column.key !== 'id'}
        onCellClick={({ row }) => void row}
        initialState={{ sort: [{ columnKey: 'qty', direction: 'desc' }] }}
        localeText={{ ...localeTextEn, rowCount: 'Rows' }}
        getRowClassName={(row) => (row.qty === null ? 'empty' : undefined)}
      />
      {/* 5. readonly の rows */}
      <SpreadsheetGrid rows={rows as readonly Row[]} columns={ok} />
      {/* 6. SSRM */}
      <SpreadsheetGrid columns={ok} dataSource={ds} />
      {/* @ts-expect-error 7. 行の型が違う ref */}
      <SpreadsheetGrid rows={rows} columns={ok} ref={otherRef} />
      {/* @ts-expect-error 8. rowKeyGetter はキー(string | number)を返す */}
      <SpreadsheetGrid rows={rows} columns={ok} rowKeyGetter={(r) => ({ id: r.id })} />
      {/* @ts-expect-error 9. 列の型と行の型が合わない */}
      <SpreadsheetGrid rows={[] as Other[]} columns={ok} />
      {/* 10. ラベル行の型ガード */}
      <SpreadsheetGrid<Row | Label, Label>
        rows={[] as (Row | Label)[]}
        columns={[{ key: 'name', width: 100 }]}
        rowKeyGetter={(r) => r.id}
        labelRow={{ isLabelRow: (r): r is Label => 'kind' in r, getLabel: (l) => l.title, sticky: true }}
      />
      {/* 11. 型引数なしでラベル行の型ガード(L が推論されるか) */}
      <SpreadsheetGrid
        rows={[] as (Row | Label)[]}
        columns={[{ key: 'name', width: 100 }]}
        rowKeyGetter={(r) => r.id}
        labelRow={{ isLabelRow: (r): r is Label => 'kind' in r, getLabel: (l) => l.title }}
      />
    </>
  )
}
