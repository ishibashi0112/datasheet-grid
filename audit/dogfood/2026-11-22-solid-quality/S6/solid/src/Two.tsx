// 1 ページに 2 つのグリッド: 上 = 今日の点検(ダーク)、下 = 前回の点検(ライト)
import { createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
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
  const [today, setToday] = createSignal(createInspections(200))
  const [prev, setPrev] = createSignal(createInspections(100).map((r) => ({ ...r, item: '前回 ' + r.item })))
  let a!: SpreadsheetGridHandle<Inspection>
  let b!: SpreadsheetGridHandle<Inspection>
  return (
    <div class="two">
      <div class="toolbar">
        <button type="button" id="focus-a" onClick={() => a.focus()}>今日へ</button>
        <button type="button" id="focus-b" onClick={() => b.focus()}>前回へ</button>
      </div>
      <section class="pane" id="pane-a">
        <h2>今日の点検</h2>
        <div class="grid-box">
          <SpreadsheetGrid ref={a} ariaLabel="今日の点検" theme="dark" rows={today()} onRowsChange={setToday} columns={columns} rowKeyGetter={(r) => r.id} height="100%" find enableContextMenu getContextMenuItems={(p) => (p.target.type === 'cell' ? [{ label: `「${String(p.target.value ?? '')}」をコピー`, onSelect: () => {} }, { label: '行の番号を見る', onSelect: () => {} }] : [])} enableRowSelection />
        </div>
      </section>
      <section class="pane" id="pane-b">
        <h2>前回の点検</h2>
        <div class="grid-box">
          <SpreadsheetGrid ref={b} ariaLabel="前回の点検" theme="light" rows={prev()} onRowsChange={setPrev} columns={columns} rowKeyGetter={(r) => r.id} height="100%" find enableContextMenu getContextMenuItems={(p) => (p.target.type === 'cell' ? [{ label: `「${String(p.target.value ?? '')}」をコピー`, onSelect: () => {} }, { label: '行の番号を見る', onSelect: () => {} }] : [])} enableRowSelection />
        </div>
      </section>
    </div>
  )
}
render(() => <Two />, document.getElementById('root')!)
