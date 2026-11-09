// 確認: filterType 'custom' の列フィルターの画面と、dateSet のプリセットで時刻(過去 1 時間)を返したときの扱い
import { StrictMode, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; ts: string; ms: number }
const now = Date.now()
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
// 直近 3 日を 10 分おき
const rows: Row[] = Array.from({ length: 432 }, (_, i) => { const ms = now - i * 10 * 60 * 1000; return { id: i + 1, ts: fmt(ms), ms } })
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'id', width: 80 },
  {
    key: 'ts', title: '時刻(dateSet)', width: 200, filterType: 'dateSet',
    dateFilterPresets: [{ id: 'lastHour', label: '過去 1 時間', resolve: (n) => ({ from: new Date(n.getTime() - 3600_000), to: n }) }, 'today'],
  },
  { key: 'ms', title: '時刻(custom)', width: 200, filterType: 'custom', filterFn: (row, v) => { (window as any).__customValues = [...((window as any).__customValues ?? []), v]; return typeof v === 'number' ? row.ms >= Date.now() - v * 60_000 : true }, valueFormatter: ({ value }) => fmt(Number(value)) },
]
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null)
  ;(window as any).__grid = ref
  return <div style={{ height: 500 }}><SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height="100%" /></div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
