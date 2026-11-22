// React 版 1.2.1: Suspense + use() の中のグリッドに、親の最初の useEffect から状態を戻す
import { Suspense, use, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 100 },
]
declare global { interface Window { grid?: SpreadsheetGridHandle<Row> | null; log: string[] } }
window.log = []
const rowsPromise = new Promise<Row[]>((r) => setTimeout(() => r(Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `品目${i + 1}`, qty: (i * 37) % 101 }))), 600))

function Inner({ gridRef }: { gridRef: React.RefObject<SpreadsheetGridHandle<Row> | null> }) {
  const rows = use(rowsPromise)
  return <SpreadsheetGrid ref={(h) => { gridRef.current = h; window.grid = h }} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} height={300} />
}
function App() {
  const gridRef = useRef<SpreadsheetGridHandle<Row> | null>(null)
  useEffect(() => {
    window.log.push(`useEffect: ref=${gridRef.current ? 'handle' : 'null'}`)
    gridRef.current?.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] })
    gridRef.current?.scrollToBottom()
  }, [])
  return (
    <div style={{ padding: 12 }}>
      <Suspense fallback={<p id="loading">読み込み中…</p>}>
        <Inner gridRef={gridRef} />
      </Suspense>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
