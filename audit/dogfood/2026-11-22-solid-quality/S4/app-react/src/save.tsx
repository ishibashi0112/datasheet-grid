// React 版 1.2.1 で同じ: onRowsChange から transition(+ useOptimistic)で保存する
//   ?mode=optimistic … useOptimistic + startTransition(async)
//   ?mode=action     … setRows(next) してから startTransition(async () => await save)
//   ?mode=plain      … setRows + async 関数
import { StrictMode, startTransition, useOptimistic, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200, editable: true },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
]
let db: Row[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `品目${i + 1}`, qty: i }))
const SAVE_MS = Number(new URLSearchParams(location.search).get('ms') ?? 1500)
const mode = new URLSearchParams(location.search).get('mode') ?? 'optimistic'
declare global { interface Window { grid?: SpreadsheetGridHandle<Row> | null; saves: string[]; db: () => Row[] } }
window.saves = []
window.db = () => db
const api = {
  list: async () => { await new Promise((r) => setTimeout(r, 100)); return structuredClone(db) },
  save: async (rows: Row[]) => {
    window.saves.push(rows.map((r) => r.name).join('|'))
    await new Promise((r) => setTimeout(r, SAVE_MS))
    db = structuredClone(rows)
  },
}

function Optimistic() {
  const [rows, setRows] = useState<Row[]>(() => structuredClone(db))
  const [optimisticRows, setOptimistic] = useOptimistic(rows)
  return (
    <SpreadsheetGrid
      ref={(h) => { window.grid = h }}
      rows={optimisticRows}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      onRowsChange={(next) =>
        startTransition(async () => {
          setOptimistic(next)
          await api.save(next)
          const fresh = await api.list()
          startTransition(() => setRows(fresh))
        })
      }
      height={400}
    />
  )
}

function ActionOnly() {
  const [rows, setRows] = useState<Row[]>(() => structuredClone(db))
  return (
    <SpreadsheetGrid
      ref={(h) => { window.grid = h }}
      rows={rows}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      onRowsChange={(next) => {
        setRows(next)
        startTransition(async () => { await api.save(next) })
      }}
      height={400}
    />
  )
}

function Plain() {
  const [rows, setRows] = useState<Row[]>(() => structuredClone(db))
  return (
    <SpreadsheetGrid
      ref={(h) => { window.grid = h }}
      rows={rows}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      onRowsChange={(next) => { setRows(next); void api.save(next) }}
      height={400}
    />
  )
}

function App() {
  return (
    <div style={{ padding: '12px' }}>
      <p id="mode">react mode={mode}</p>
      {mode === 'optimistic' ? <Optimistic /> : mode === 'action' ? <ActionOnly /> : <Plain />}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
