import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridCellRef,
  type GridColumn,
  type GridContextMenuItem,
  type SpreadsheetGridHandle,
  type UndoRedoState,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { createInspections, type Inspection } from './data'
import './app.css'

const resultOptions = [
  { label: '良', value: '良' },
  { label: '要注意', value: '要注意' },
  { label: '不良', value: '不良' },
  { label: '対象外', value: '対象外' },
]

const valueFormat = numberFormatter({ maximumFractionDigits: 2 })

const defaultColumns: GridColumn<Inspection>[] = [
  { key: 'area', title: '場所', width: 120, pinned: 'left', editable: false, filterType: 'set' },
  { key: 'item', title: '項目', width: 150, editable: false, filterType: 'textSet' },
  {
    key: 'result',
    title: '結果',
    width: 104,
    editor: { type: 'select', options: resultOptions },
    filterType: 'set',
    conditionalFormat: {
      chips: { 良: 'good', 要注意: 'warning', 不良: 'critical', 対象外: 'neutral' },
    },
  },
  {
    key: 'value',
    title: '測定値',
    width: 96,
    align: 'right',
    editor: { type: 'number', min: 0 },
    valueFormatter: valueFormat,
    filterType: 'numberSet',
  },
  { key: 'unit', title: '単位', width: 64, readOnly: true },
  {
    key: 'memo',
    title: 'メモ',
    width: 200,
    editor: { type: 'text', multiline: true },
    validate: ({ value, row }) =>
      row.result !== '不良' || String(value ?? '').trim() !== '' || '不良のときはメモを書いてください',
  },
  {
    key: 'photo',
    title: '写真',
    width: 72,
    align: 'center',
    editor: { type: 'checkbox' },
    validate: ({ value, row }) => row.result !== '不良' || value === true || '不良のときは写真を撮ってください',
  },
  { key: 'inspectedAt', title: '点検日', width: 128, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'inspector', title: '点検者', width: 96, filterType: 'set' },
]

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let seq = 10000

export function App() {
  const gridRef = useRef<SpreadsheetGridHandle<Inspection>>(null)
  const [rows, setRows] = useState<Inspection[]>(createInspections)
  const [columns, setColumns] = useState<GridColumn<Inspection>[]>(defaultColumns)
  const [inspector, setInspector] = useState('佐藤')
  const [active, setActive] = useState<GridCellRef<Inspection> | null>(null)
  const [undoState, setUndoState] = useState<UndoRedoState>({ canUndo: false, canRedo: false })
  const [message, setMessage] = useState('')

  const summary = useMemo(() => {
    let done = 0
    let ng = 0
    for (const r of rows) {
      if (r.result) done++
      if (r.result === '不良') ng++
    }
    return { done, ng, total: rows.length }
  }, [rows])

  // 今の行の下に点検項目を足して、項目名ではなく「結果」の編集を始める
  const addRowBelow = () => {
    const grid = gridRef.current
    if (!grid) return
    const base = active?.row
    const row: Inspection = {
      id: `INS-${++seq}`,
      area: base?.area ?? '未設定',
      item: '追加項目',
      result: null,
      value: null,
      unit: '',
      memo: '',
      photo: false,
      inspectedAt: today(),
      inspector,
    }
    const at = active ? active.sourceRowIndex + 1 : rows.length
    const next = [...rows.slice(0, at), row, ...rows.slice(at)]
    flushSync(() => grid.applyRows(next))
    const viewRowIndex = grid.getViewRowIndex(row.id)
    const colIndex = grid.getColIndex('result')
    if (viewRowIndex >= 0 && colIndex >= 0) grid.startEditing(viewRowIndex, colIndex)
  }

  const showNgOnly = () => {
    gridRef.current?.applyState({
      filters: { columnFilters: { result: { kind: 'set', values: ['不良'] } } },
    })
  }

  const clearFilters = () => {
    gridRef.current?.applyState({ filters: { globalText: '', columnFilters: {} } })
  }

  const submit = () => {
    const grid = gridRef.current
    if (!grid) return
    const invalid = grid.getInvalidCells()
    if (invalid.length === 0) {
      setMessage('送信しました')
      return
    }
    const first = invalid[0]
    const rowNo = grid.getRowNumber(first.rowKey)
    setMessage(`${invalid.length} 件の入力漏れがあります(${rowNo ?? '?'} 行目: ${first.message})`)
    const viewRowIndex = grid.getViewRowIndex(first.rowKey)
    const colIndex = grid.getColIndex(first.columnKey)
    if (viewRowIndex >= 0 && colIndex >= 0) {
      grid.selectCell(viewRowIndex, colIndex, { scrollIntoView: true })
      grid.focus()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>現場点検 — 本社ビル 2026年11月</h1>
        <div className="app-summary" aria-live="polite">
          済 {summary.done} / {summary.total}・不良 {summary.ng}
        </div>
      </header>
      <form
        className="app-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label>
          点検者
          <input value={inspector} onChange={(e) => setInspector(e.target.value)} name="inspector" />
        </label>
        <button type="button" onClick={addRowBelow}>
          行を追加
        </button>
        <button type="button" onClick={showNgOnly}>
          不良のみ
        </button>
        <button type="button" onClick={clearFilters}>
          絞り込み解除
        </button>
        <button type="button" onClick={() => gridRef.current?.undo()} disabled={!undoState.canUndo}>
          元に戻す
        </button>
        <button type="submit">送信</button>
      </form>
      {message && (
        <p className="app-message" role="status">
          {message}
        </p>
      )}
      <main className="app-grid">
        <SpreadsheetGrid<Inspection>
          ref={gridRef}
          ariaLabel="点検項目"
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          height="100%"
          find
          showFilterChipBar
          onColumnsChange={setColumns}
          enableContextMenu
          getContextMenuItems={(params): GridContextMenuItem[] => {
            const key = params.target.rowKey
            return [
              { kind: 'label', label: '行の操作' },
              {
                label: 'メモをクリア',
                onSelect: () => gridRef.current?.applyRows(rows.map((r) => (r.id === key ? { ...r, memo: '' } : r))),
              },
              { kind: 'separator' },
              {
                label: 'この行を削除',
                danger: true,
                onSelect: () => gridRef.current?.applyRows(rows.filter((r) => r.id !== key)),
              },
            ]
          }}
          onActiveCellChange={setActive}
          onUndoRedoStateChange={setUndoState}
        />
      </main>
      <footer className="app-footer">
        {active ? (
          <span>
            {active.row.area} / {active.row.item} / {active.column.title}: {String(active.value ?? '')}
          </span>
        ) : (
          <span>セルを選んでください</span>
        )}
        <a href="#help">使い方</a>
      </footer>
    </div>
  )
}
