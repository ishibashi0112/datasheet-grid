// React 版: Solid 版の S9 と同じ画面
import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  SpreadsheetGrid,
  type GridContextMenuItem,
  type GridContextMenuParams,
  type GridInvalidCell,
  type GridPasteSkippedParams,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { createColumns } from './columns'
import { initialExpenses, newExpense, taxOf, type Expense } from './data'

const params = new URLSearchParams(location.search)
const columns = createColumns()
const dialogColumns = createColumns().map((c) => (c.key === 'memo' || c.key === 'account' ? c : { ...c, editable: false }))

export function App() {
  const [rows, setRows] = useState<Expense[]>(initialExpenses)
  const [form, setForm] = useState({ name: '', dept: '営業部', period: '2026-11', purpose: '' })
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false })
  const [toast, setToast] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<GridInvalidCell[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const grid = useRef<SpreadsheetGridHandle<Expense>>(null)
  const dialogGrid = useRef<SpreadsheetGridHandle<Expense>>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const toastTimer = useRef(0)
  ;(window as unknown as { __rows: () => Expense[] }).__rows = () => rowsRef.current
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  ;(window as unknown as { __grid: unknown }).__grid = new Proxy({}, { get: (_, k) => (grid.current as never)?.[k] })
  ;(window as unknown as { __dialogGrid: unknown }).__dialogGrid = new Proxy({}, { get: (_, k) => (dialogGrid.current as never)?.[k] })

  const total = useMemo(() => rows.reduce((s, r) => s + (typeof r.amount === 'number' ? r.amount : 0), 0), [rows])
  const totalTax = useMemo(() => rows.reduce((s, r) => s + (taxOf(r) ?? 0), 0), [rows])
  const showToast = (text: string) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4000)
  }
  const addRow = () => {
    const row = newExpense()
    flushSync(() => setRows((prev) => [...prev, row]))
    const v = grid.current?.getViewRowIndex(row.id) ?? -1
    const c = grid.current?.getColIndex('date') ?? -1
    if (v >= 0 && c >= 0) grid.current?.startEditing(v, c)
  }
  const onPasteSkipped = ({ cells }: GridPasteSkippedParams<Expense>) => {
    const messages = [...new Set(cells.map((c) => (c.reason === 'invalid' ? c.message ?? '入力できない値' : '編集できないセル')))]
    showToast(`${cells.length} 個のセルは書きませんでした(${messages.join(' / ')})`)
    ;(window as unknown as { __skipped: unknown }).__skipped = cells.map((c) => ({ ...c, row: undefined }))
  }
  const contextMenu = (p: GridContextMenuParams<Expense>): GridContextMenuItem[] => [
    { label: 'この行を削除', danger: true, onSelect: () => grid.current?.applyRows((prev) => prev.filter((r) => r.id !== p.target.rowKey)) },
  ]
  const openConfirm = () => {
    setInvalid(grid.current?.getInvalidCells() ?? [])
    setSubmitted(true)
    flushSync(() => setDialogOpen(true))
    dialog.current!.showModal()
  }
  const jumpTo = (cell: GridInvalidCell) => {
    dialog.current!.close()
    const g = grid.current
    const v = g?.getViewRowIndex(cell.rowKey) ?? -1
    const c = g?.getColIndex(cell.columnKey) ?? -1
    if (g && v >= 0 && c >= 0) {
      g.scrollToCell(v, c)
      g.selectCell(v, c)
      g.focus()
    }
  }
  const downloadCsv = () => {
    ;(window as unknown as { __csv: string }).__csv = grid.current?.exportCsv({ escapeFormulas: true, includeTotalRow: true }) ?? ''
    grid.current?.downloadCsv(`経費精算_${form.period}.csv`, { escapeFormulas: true, includeTotalRow: true })
  }
  return (
    <div className="app">
      <h1>経費精算書</h1>
      <form className="applicant" onSubmit={(e) => e.preventDefault()} data-testid="applicant-form">
        <label>申請者<input name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} placeholder="山田 太郎" /></label>
        <label>所属<select name="dept" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.currentTarget.value })}><option>営業部</option><option>開発部</option><option>管理部</option></select></label>
        <label>対象月<input name="period" type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.currentTarget.value })} /></label>
        <label className="wide">目的<input name="purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.currentTarget.value })} placeholder="〇〇プロジェクトの顧客訪問" /></label>
      </form>
      <div className="toolbar">
        <button type="button" onClick={addRow} data-testid="add-row">行を追加</button>
        <button type="button" disabled={!undoState.canUndo} onClick={() => grid.current?.undo()} data-testid="undo">元に戻す</button>
        <button type="button" disabled={!undoState.canRedo} onClick={() => grid.current?.redo()} data-testid="redo">やり直す</button>
        <button type="button" onClick={downloadCsv} data-testid="csv">印刷用 CSV</button>
        <span className="spacer" />
        <span className="sum" data-testid="sum">合計 {total.toLocaleString()} 円(うち消費税 {totalTax.toLocaleString()} 円)</span>
        <button type="button" className="primary" onClick={openConfirm} data-testid="confirm">申請内容を確認</button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="grid-area">
        <SpreadsheetGrid
          ref={grid}
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          createRow={newExpense}
          height={420}
          autoHeight
          imeDirectInput={!params.has('noime')}
          fillHandle
          totalRow={{ label: '合計' }}
          showValidationMarks={params.has('marksOnSubmit') ? submitted : true}
          onPasteSkipped={onPasteSkipped}
          onUndoRedoStateChange={setUndoState}
          enableContextMenu
          getContextMenuItems={contextMenu}
          ariaLabel="経費の明細"
        />
      </div>
      <dialog ref={dialog} className="confirm" data-testid="confirm-dialog" onClose={() => setDialogOpen(false)}>
        <h2>申請内容の確認</h2>
        <dl>
          <dt>申請者</dt><dd data-testid="confirm-name">{form.name || '(未入力)'}({form.dept})</dd>
          <dt>対象月</dt><dd>{form.period}</dd>
          <dt>合計</dt><dd>{total.toLocaleString()} 円</dd>
        </dl>
        {invalid.length > 0 ? (
          <>
            <p className="ng">直してから申請してください({invalid.length} 件)</p>
            <ul className="invalid-list" data-testid="invalid-list">
              {invalid.map((cell) => (
                <li key={`${cell.rowKey}:${cell.columnKey}`}>
                  <button type="button" onClick={() => jumpTo(cell)}>{grid.current?.getRowNumber(cell.rowKey) ?? '?'} 行目: {cell.message}</button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="ok">入力の誤りはありません。</p>
        )}
        {dialogOpen && (
          <div className="dialog-grid">
            <SpreadsheetGrid ref={dialogGrid} rows={rows} columns={dialogColumns} onRowsChange={setRows} rowKeyGetter={(row) => row.id} height={240} totalRow ariaLabel="確認する明細" />
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialog.current!.close()} data-testid="dialog-close">閉じる</button>
          <button type="button" className="primary" disabled={invalid.length > 0} onClick={() => { dialog.current!.close(); showToast('申請しました') }}>申請する</button>
        </div>
      </dialog>
    </div>
  )
}
