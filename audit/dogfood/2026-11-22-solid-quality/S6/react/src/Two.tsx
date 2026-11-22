// React 版の同じ画面(1 ページに 2 つのグリッド)
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import './index.css'
import { createInspections, type Inspection } from './data'

const resultOptions = [
  { value: 'ok', label: '良' },
  { value: 'warn', label: '要確認' },
  { value: 'ng', label: '不良' },
]
const columns: GridColumn<Inspection>[] = [
  { key: 'place', title: '場所', width: 130, pinned: 'left', filterType: 'set' },
  { key: 'item', title: '項目', width: 150, filterType: 'text' },
  { key: 'result', title: '結果', width: 100, editor: { type: 'select', options: resultOptions }, valueFormatter: ({ value }) => resultOptions.find((o) => o.value === value)?.label ?? '', filterType: 'set' },
  { key: 'value', title: '数値', width: 90, align: 'right', editor: { type: 'number', min: 0, max: 100 }, filterType: 'number' },
  { key: 'memo', title: 'メモ', width: 180, editor: { type: 'text', multiline: true } },
  { key: 'photo', title: '写真', width: 70, editor: { type: 'checkbox' } },
]

function Two() {
  const [today, setToday] = useState(() => createInspections(200))
  const [prev, setPrev] = useState(() => createInspections(100).map((r) => ({ ...r, item: '前回 ' + r.item })))
  const a = useRef<SpreadsheetGridHandle<Inspection>>(null)
  const b = useRef<SpreadsheetGridHandle<Inspection>>(null)
  return (
    <div className="two">
      <div className="toolbar">
        <button type="button" id="focus-a" onClick={() => a.current?.focus()}>今日へ</button>
        <button type="button" id="focus-b" onClick={() => b.current?.focus()}>前回へ</button>
      </div>
      <section className="pane" id="pane-a">
        <h2>今日の点検</h2>
        <div className="grid-box">
          <SpreadsheetGrid ref={a} ariaLabel="今日の点検" theme="dark" rows={today} onRowsChange={setToday} columns={columns} rowKeyGetter={(r) => r.id} height="100%" find enableContextMenu getContextMenuItems={(p) => (p.target.type === 'cell' ? [{ label: `「${String(p.target.value ?? '')}」をコピー`, onSelect: () => {} }, { label: '行の番号を見る', onSelect: () => {} }] : [])} enableRowSelection />
        </div>
      </section>
      <section className="pane" id="pane-b">
        <h2>前回の点検</h2>
        <div className="grid-box">
          <SpreadsheetGrid ref={b} ariaLabel="前回の点検" theme="light" rows={prev} onRowsChange={setPrev} columns={columns} rowKeyGetter={(r) => r.id} height="100%" find enableContextMenu getContextMenuItems={(p) => (p.target.type === 'cell' ? [{ label: `「${String(p.target.value ?? '')}」をコピー`, onSelect: () => {} }, { label: '行の番号を見る', onSelect: () => {} }] : [])} enableRowSelection />
        </div>
      </section>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<Two />)
