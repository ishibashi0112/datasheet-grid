// 計測: 100 万行の表の末尾に 50 行足す 1 回の更新にかかる時間(ソートなし / ソートあり / 列フィルターあり)
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; ts: string; level: string }
const q = new URLSearchParams(location.search)
const N = Number(q.get('rows') ?? 1_000_000)
const mode = q.get('mode') ?? 'none'
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const ts = (i: number) => `2026-11-${pad(1 + Math.floor(i / 150000))} ${pad(Math.floor(i / 3600) % 24)}:${pad(Math.floor(i / 60) % 60)}:${pad(i % 60)}.${pad(i % 1000, 3)}`
const LV = ['DEBUG', 'INFO', 'INFO', 'INFO', 'WARN', 'ERROR']
const initial: Row[] = Array.from({ length: N }, (_, i) => ({ id: i + 1, ts: ts(i), level: LV[i % 6]! }))
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'id', width: 100 },
  { key: 'ts', title: 'ts', width: 220 },
  { key: 'level', title: 'level', width: 100, filterType: 'set' },
]
const initialState =
  mode === 'sort' ? { sort: [{ columnKey: 'ts', direction: 'desc' as const }] }
  : mode === 'filter' ? { filters: { columnFilters: { level: { kind: 'set' as const, mode: 'include' as const, values: ['ERROR'] } } } }
  : mode === 'idsort' ? { sort: [{ columnKey: 'id', direction: 'desc' as const }] }
  : undefined

function App() {
  const [rows, setRows] = useState(initial)
  return (
    <div>
      <button
        id="add"
        onClick={() => {
          ;(window as any).__t0 = performance.now()
          setRows((prev) => { const add = Array.from({ length: 50 }, (_, i) => ({ id: prev.length + i + 1, ts: ts(prev.length + i), level: LV[i % 6]! })); return mode === 'prepend' ? [...add.reverse(), ...prev] : [...prev, ...add] })
          requestAnimationFrame(() => setTimeout(() => { (window as any).__dt = performance.now() - (window as any).__t0 }))
        }}
      >
        末尾に 50 行足す
      </button>
      <div style={{ height: 400 }}>
        <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} onRowsChange={(next) => { ;(window as any).__t0 = performance.now(); setRows(next); requestAnimationFrame(() => setTimeout(() => { (window as any).__dt = performance.now() - (window as any).__t0 })) }} initialState={initialState} height="100%" />
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
