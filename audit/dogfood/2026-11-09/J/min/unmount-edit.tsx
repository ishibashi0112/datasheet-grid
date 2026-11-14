// 最小再現: セルを編集している途中に、キーボードのショートカット(Alt+H)でグリッドを隠す / 外す(?mode=unmount | hide)
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; note: string }
const columns: GridColumn<Row>[] = [{ key: 'note', title: '備考', width: 200 }]
const mode = new URLSearchParams(location.search).get('mode') ?? 'unmount'

function App() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, (_, i) => ({ id: i, note: '' })))
  const [show, setShow] = useState(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyH') {
        e.preventDefault()
        setShow((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const grid = <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={240} />
  return (
    <div style={{ padding: 16, width: 400 }}>
      <p id="rows">{JSON.stringify(rows.map((r) => r.note))}</p>
      {mode === 'hide' ? <div style={{ display: show ? 'block' : 'none' }}>{grid}</div> : show && grid}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
