// 経費精算の申請画面。上に申請者のフォーム、真ん中に明細のグリッド(合計行つき)、申請の確認は <dialog>。
import { createMemo, createSignal, createStore, flush, For, Show } from 'solid-js'
import {
  SpreadsheetGrid,
  type GridContextMenuItem,
  type GridContextMenuParams,
  type GridInvalidCell,
  type GridPasteSkippedParams,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { createColumns } from './columns'
import { initialExpenses, newExpense, taxOf, type Expense } from './data'

const params = new URLSearchParams(location.search)
const columns = createColumns()
// 確認のダイアログの中のグリッドでは、摘要と科目だけを直せる
const dialogColumns = createColumns().map((c) => (c.key === 'memo' || c.key === 'account' ? c : { ...c, editable: false }))

export function App() {
  const [rows, setRows] = createSignal<Expense[]>(initialExpenses())
  const [form, setForm] = createStore({ name: '', dept: '営業部', period: '2026-11', purpose: '' })
  const [undoState, setUndoState] = createSignal({ canUndo: false, canRedo: false })
  const [toast, setToast] = createSignal<string | null>(null)
  const [invalid, setInvalid] = createSignal<GridInvalidCell[]>([])
  const [submitted, setSubmitted] = createSignal(false)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  let grid: SpreadsheetGridHandle<Expense> | undefined
  let dialogGrid: SpreadsheetGridHandle<Expense> | undefined
  let dialog!: HTMLDialogElement
  let toastTimer = 0
  ;(window as unknown as { __rows: () => Expense[] }).__rows = rows

  const total = createMemo(() => rows().reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0))
  const totalTax = createMemo(() => rows().reduce((sum, r) => sum + (taxOf(r) ?? 0), 0))

  const showToast = (text: string) => {
    setToast(text)
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => setToast(null), 4000)
  }

  const addRow = () => {
    const row = newExpense()
    setRows((prev) => [...prev, row])
    flush()
    const viewRowIndex = grid?.getViewRowIndex(row.id) ?? -1
    const colIndex = grid?.getColIndex('date') ?? -1
    if (viewRowIndex >= 0 && colIndex >= 0) grid?.startEditing(viewRowIndex, colIndex)
  }

  const onPasteSkipped = ({ cells }: GridPasteSkippedParams<Expense>) => {
    const messages = [...new Set(cells.map((c) => (c.reason === 'invalid' ? c.message ?? '入力できない値' : '編集できないセル')))]
    showToast(`${cells.length} 個のセルは書きませんでした(${messages.join(' / ')})`)
    ;(window as unknown as { __skipped: unknown }).__skipped = cells.map((c) => ({ ...c, row: undefined }))
  }

  const contextMenu = (p: GridContextMenuParams<Expense>): GridContextMenuItem[] => [
    {
      label: 'この行を削除',
      danger: true,
      onSelect: () => grid?.applyRows((prev) => prev.filter((r) => r.id !== p.target.rowKey)),
    },
    {
      label: '下に行を挿入',
      onSelect: () =>
        grid?.applyRows((prev) => {
          const i = prev.findIndex((r) => r.id === p.target.rowKey)
          const next = prev.slice()
          next.splice(i + 1, 0, newExpense())
          return next
        }),
    },
  ]

  const openConfirm = () => {
    setInvalid(grid?.getInvalidCells() ?? [])
    setSubmitted(true)
    setDialogOpen(true)
    flush()
    dialog.showModal()
  }

  const jumpTo = (cell: GridInvalidCell) => {
    dialog.close()
    const viewRow = grid?.getViewRowIndex(cell.rowKey) ?? -1
    const col = grid?.getColIndex(cell.columnKey) ?? -1
    if (grid && viewRow >= 0 && col >= 0) {
      grid.scrollToCell(viewRow, col)
      grid.selectCell(viewRow, col)
      grid.focus()
    }
  }

  const downloadCsv = () => {
    const csv = grid?.exportCsv({ escapeFormulas: true, includeTotalRow: true }) ?? ''
    ;(window as unknown as { __csv: string }).__csv = csv
    grid?.downloadCsv(`経費精算_${form.period}.csv`, { escapeFormulas: true, includeTotalRow: true })
  }

  return (
    <div class="app">
      <h1>経費精算書</h1>
      <form class="applicant" onSubmit={(e) => e.preventDefault()} data-testid="applicant-form">
        <label>
          申請者
          <input name="name" value={form.name} onInput={(e) => setForm((f) => { f.name = e.currentTarget.value })} placeholder="山田 太郎" />
        </label>
        <label>
          所属
          <select name="dept" value={form.dept} onChange={(e) => setForm((f) => { f.dept = e.currentTarget.value })}>
            <option>営業部</option>
            <option>開発部</option>
            <option>管理部</option>
          </select>
        </label>
        <label>
          対象月
          <input name="period" type="month" value={form.period} onInput={(e) => setForm((f) => { f.period = e.currentTarget.value })} />
        </label>
        <label class="wide">
          目的
          <input name="purpose" value={form.purpose} onInput={(e) => setForm((f) => { f.purpose = e.currentTarget.value })} placeholder="〇〇プロジェクトの顧客訪問" />
        </label>
      </form>

      <div class="toolbar">
        <button type="button" onClick={addRow} data-testid="add-row">
          行を追加
        </button>
        <button type="button" disabled={!undoState().canUndo} onClick={() => grid?.undo()} data-testid="undo">
          元に戻す
        </button>
        <button type="button" disabled={!undoState().canRedo} onClick={() => grid?.redo()} data-testid="redo">
          やり直す
        </button>
        <button type="button" onClick={downloadCsv} data-testid="csv">
          印刷用 CSV
        </button>
        <span class="spacer" />
        <span class="sum" data-testid="sum">
          合計 {total().toLocaleString()} 円(うち消費税 {totalTax().toLocaleString()} 円)
        </span>
        <button type="button" class="primary" onClick={openConfirm} data-testid="confirm">
          申請内容を確認
        </button>
      </div>

      <Show when={toast()}>{(t) => <div class="toast" role="status">{t()}</div>}</Show>

      <div class="grid-area">
        <SpreadsheetGrid
          ref={(h) => {
            grid = h
            ;(window as unknown as { __grid: unknown }).__grid = h
          }}
          rows={rows()}
          columns={columns}
          onRowsChange={(next) => setRows(next)}
          rowKeyGetter={(row) => row.id}
          createRow={newExpense}
          height={420}
          autoHeight
          imeDirectInput={!params.has('noime')}
          fillHandle
          totalRow={{ label: '合計' }}
          showValidationMarks={params.has('marksOnSubmit') ? submitted() : true}
          onPasteSkipped={onPasteSkipped}
          onUndoRedoStateChange={(s) => setUndoState(s)}
          enableContextMenu
          getContextMenuItems={contextMenu}
          ariaLabel="経費の明細"
        />
      </div>

      <dialog ref={dialog} class="confirm" data-testid="confirm-dialog" onClose={() => setDialogOpen(false)}>
        <h2>申請内容の確認</h2>
        <dl>
          <dt>申請者</dt>
          <dd data-testid="confirm-name">{form.name || '(未入力)'}({form.dept})</dd>
          <dt>対象月</dt>
          <dd>{form.period}</dd>
          <dt>合計</dt>
          <dd>{total().toLocaleString()} 円</dd>
        </dl>
        <Show
          when={invalid().length > 0}
          fallback={<p class="ok">入力の誤りはありません。</p>}
        >
          <p class="ng">直してから申請してください({invalid().length} 件)</p>
          <ul class="invalid-list" data-testid="invalid-list">
            <For each={invalid()}>
              {(cell) => (
                <li>
                  <button type="button" onClick={() => jumpTo(cell)}>
                    {grid?.getRowNumber(cell.rowKey) ?? '?'} 行目: {cell.message}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={dialogOpen()}>
          <div class="dialog-grid">
            <SpreadsheetGrid
              ref={(h) => {
                dialogGrid = h
                ;(window as unknown as { __dialogGrid: unknown }).__dialogGrid = dialogGrid
              }}
              rows={rows()}
              columns={dialogColumns}
              onRowsChange={(next) => setRows(next)}
              rowKeyGetter={(row) => row.id}
              height={240}
              totalRow
              ariaLabel="確認する明細"
            />
          </div>
        </Show>
        <div class="dialog-actions">
          <button type="button" onClick={() => dialog.close()} data-testid="dialog-close">
            閉じる
          </button>
          <button
            type="button"
            class="primary"
            disabled={invalid().length > 0}
            onClick={() => {
              dialog.close()
              showToast('申請しました')
            }}
          >
            申請する
          </button>
        </div>
      </dialog>
    </div>
  )
}
