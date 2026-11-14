// 最小再現用のページ(?case=...)
import { StrictMode, forwardRef, useRef, useState, type Ref } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }
const initial: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i + 1 }))
const labelRows: Row[] = [{ id: -1, name: '', qty: 0 }, ...initial.slice(0, 3), { id: -2, name: '', qty: 0 }, ...initial.slice(3, 6)]
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' }, aggFunc: 'sum' },
]
const c = new URLSearchParams(location.search).get('case') ?? ''

// React 18: 包む部品は forwardRef(ドキュメントどおり)
const WrappedFwd = forwardRef<SpreadsheetGridHandle<Row>, Omit<SpreadsheetGridProps<Row>, 'ref'>>(function WrappedFwd(props, ref) {
  return <SpreadsheetGrid {...props} ref={ref} />
})
// forwardRef を付け忘れた形
function WrappedPlain(props: SpreadsheetGridProps<Row>) {
  return <SpreadsheetGrid {...props} />
}

// 品名の custom エディタ: 枠の下へはみ出す候補リスト(ドキュメントの「はみ出して描いてよい」)
const popupColumns: GridColumn<Row>[] = [
  {
    key: 'name',
    title: '品名',
    width: 200,
    editor: {
      type: 'custom',
      render: (ctx) => (
        <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', background: 'var(--ssg-cell-bg)' }}>
          <input
            autoFocus
            defaultValue={String(ctx.value ?? '')}
            style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ctx.commit(e.currentTarget.value, 'down')
              if (e.key === 'Escape') ctx.cancel()
            }}
          />
          <ul id="popup" style={{ position: 'absolute', top: '100%', left: 0, width: 220, margin: 0, padding: 4, background: '#fff', border: '1px solid #888', listStyle: 'none', zIndex: 10 }}>
            <li>候補 A</li>
            <li>候補 B</li>
            <li>候補 C</li>
            <li>候補 D</li>
          </ul>
        </div>
      ),
    },
  },
  columns[1],
]

function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  const [rows, setRows] = useState<Row[]>(initial)
  ;(window as unknown as { __mini: unknown }).__mini = { ref, rows }
  const common = { rows, onRowsChange: setRows, rowKeyGetter: (r: Row) => r.id, height: '100%' as const }
  let grid
  if (c === 'wrap-fwd') grid = <WrappedFwd ref={ref} columns={columns} {...common} />
  else if (c === 'wrap-plain') grid = <WrappedPlain ref={ref as Ref<SpreadsheetGridHandle<Row>>} columns={columns} {...common} />
  else if (c === 'popup') grid = <SpreadsheetGrid ref={ref} columns={popupColumns} {...common} totalRow />
  else if (c === 'ctx')
    grid = (
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        {...common}
        enableContextMenu
        getContextMenuItems={(p) => [
          {
            label: '下に行を挿入(すぐ編集)',
            onSelect: () => {
              const g = ref.current!
              const newRow = { id: Date.now(), name: '', qty: 0 }
              const i = rows.findIndex((r) => r.id === p.target.rowKey)
              flushSync(() => setRows([...rows.slice(0, i + 1), newRow, ...rows.slice(i + 1)]))
              ;(window as unknown as { __started: unknown }).__started = g.startEditing(g.getViewRowIndex(newRow.id), g.getColIndex('name'))
            },
          },
          {
            label: 'このセルを編集',
            onSelect: () => {
              const g = ref.current!
              if (p.target.type === 'cell') (window as unknown as { __started: unknown }).__started = g.startEditing(p.target.rowIndex, p.target.colIndex)
            },
          },
          {
            label: 'このセルを編集(setTimeout)',
            onSelect: () => {
              const g = ref.current!
              if (p.target.type === 'cell') { const t = p.target; setTimeout(() => { (window as unknown as { __started: unknown }).__started = g.startEditing(t.rowIndex, t.colIndex) }, 0) }
            },
          },
        ]}
      />
    )
  else if (c === 'label-validate')
    grid = (
      <SpreadsheetGrid
        ref={ref}
        columns={[
          { key: 'name', title: '品名', width: 200, validate: ({ value }) => String(value ?? '') !== '' || '必須です' },
          { key: 'qty', title: '数量', width: 100, editor: { type: 'number', min: 1 } },
        ]}
        {...common}
        rows={labelRows}
        labelRow={{ isLabelRow: (r) => r.id < 0, getLabel: (r) => `区分 ${-r.id}` }}
      />
    )
  else if (c === 'custom-noguard')
    grid = (
      <SpreadsheetGrid
        ref={ref}
        columns={[
          {
            key: 'name',
            title: '品名',
            width: 200,
            editor: {
              type: 'custom',
              render: (ctx) => (
                <input
                  autoFocus
                  defaultValue={ctx.initialText || String(ctx.value ?? '')}
                  style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); (window as any).__res = [...((window as any).__res ?? []), ctx.commit(e.currentTarget.value, 'down')] }
                    if (e.key === 'Tab') { e.preventDefault(); (window as any).__res = [...((window as any).__res ?? []), ctx.commit(e.currentTarget.value, e.shiftKey ? 'left' : 'right')] }
                    if (e.key === 'Escape') ctx.cancel()
                  }}
                  onBlur={(e) => { (window as any).__res = [...((window as any).__res ?? []), ctx.commit(e.currentTarget.value)] }}
                />
              ),
            },
          },
          columns[1],
        ]}
        {...common}
        onRowsChange={(next) => { (window as any).__changes = ((window as any).__changes ?? 0) + 1; setRows(next) }}
      />
    )
  else if (c === 'drag') grid = <SpreadsheetGrid ref={ref} columns={columns} {...common} enableRowDrag />
  else grid = <SpreadsheetGrid ref={ref} columns={columns} {...common} />
  return (
    <div style={{ padding: 16 }}>
      <input aria-label="外の入力欄" defaultValue="abc" />
      <div style={{ height: 400 }}>{grid}</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
