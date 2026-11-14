import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
  type UndoRedoState,
  type RowSelectionModel,
} from '@ishibashi0112/spreadsheet-grid'
import {
  CATEGORY_OPTIONS,
  STATUS_LABEL,
  TAX_OPTIONS,
  makeInitialRows,
  newId,
  today,
  type Expense,
} from './data'

const yen = numberFormatter()

const labelOf = (options: { value: string; label: string }[]) => {
  const map = new Map(options.map((o) => [o.value, o.label]))
  return ({ value }: { value: unknown }) => map.get(String(value ?? '')) ?? String(value ?? '')
}

// select 列: 表示名でコピー / 貼り付けできるようにする(Excel との往復)
const selectClipboard = (options: { value: string; label: string }[]) => ({
  formatClipboardValue: (value: unknown) => options.find((o) => o.value === value)?.label ?? String(value ?? ''),
  parseClipboardValue: (raw: string) => {
    const t = raw.trim()
    return options.find((o) => o.label === t || o.value === t)?.value ?? t
  },
})

function formatYen(n: number) {
  return `¥${n.toLocaleString('ja-JP')}`
}

const columns: GridColumn<Expense>[] = [
  {
    key: 'date',
    title: '日付',
    width: 130,
    editor: { type: 'date' },
    filterType: 'dateSet',
    validate: ({ value }) => {
      if (value == null || value === '') return '日付は必須です'
      if (typeof value === 'string' && value > today()) return '未来の日付は登録できません'
      return true
    },
  },
  {
    key: 'category',
    title: '区分',
    width: 120,
    editor: { type: 'select', options: CATEGORY_OPTIONS },
    valueFormatter: labelOf(CATEGORY_OPTIONS),
    ...selectClipboard(CATEGORY_OPTIONS),
    filterType: 'set',
    filterOptions: CATEGORY_OPTIONS,
    aggFunc: 'count',
  },
  {
    key: 'amount',
    title: '金額',
    width: 120,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    filterType: 'number',
    aggFunc: 'sum',
    valueFormatter: yen,
    validate: ({ value }) =>
      typeof value === 'number' && value > 500000 ? '1 件 50 万円までです(超える場合は経理へ)' : true,
    validationMode: 'reject',
  },
  {
    key: 'taxType',
    title: '税区分',
    width: 110,
    editor: { type: 'select', options: TAX_OPTIONS },
    valueFormatter: labelOf(TAX_OPTIONS),
    ...selectClipboard(TAX_OPTIONS),
    filterType: 'set',
    filterOptions: TAX_OPTIONS,
  },
  {
    key: 'receipt',
    title: '領収書',
    width: 80,
    align: 'center',
    editor: { type: 'checkbox' },
    validate: ({ value, row }) =>
      (row.amount ?? 0) >= 30000 && !value ? '3 万円以上は領収書が必要です' : true,
  },
  {
    key: 'memo',
    title: '摘要',
    width: 260,
    flex: 1,
    autoHeight: true,
    editor: { type: 'text', multiline: true },
    filterType: 'text',
    validate: ({ value, row }) =>
      row.category === 'entertainment' && String(value ?? '').trim() === ''
        ? '交際費は摘要(相手先・人数)が必須です'
        : true,
  },
  {
    key: 'status',
    title: '状態',
    width: 112,
    editable: false,
    valueFormatter: ({ value }) => STATUS_LABEL[value as Expense['status']] ?? String(value ?? ''),
    conditionalFormat: { chips: { draft: 'neutral', submitted: 'good' } },
    filterType: 'set',
    filterOptions: [
      { value: 'draft', label: '下書き' },
      { value: 'submitted', label: '提出済み' },
    ],
  },
]

type FormState = {
  date: string
  category: string
  amount: string
  taxType: string
  memo: string
}

const emptyForm = (): FormState => ({
  date: today(),
  category: 'transport',
  amount: '',
  taxType: 'exempt',
  memo: '',
})

export default function App() {
  const gridRef = useRef<SpreadsheetGridHandle<Expense>>(null)
  const [rows, setRows] = useState<Expense[]>(() => makeInitialRows())
  const [form, setForm] = useState<FormState>(emptyForm)
  const [undoState, setUndoState] = useState<UndoRedoState>({ canUndo: false, canRedo: false })
  const [rowSelection, setRowSelection] = useState<RowSelectionModel>({ type: 'include', rowKeys: [] })
  const [dark, setDark] = useState(false)
  const [message, setMessage] = useState('')

  // 点検用: 状態を外から読めるようにする
  useEffect(() => {
    ;(window as unknown as { __app: unknown }).__app = { grid: gridRef.current, rows }
  })

  const total = useMemo(() => rows.reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0), [rows])
  const draftCount = rows.filter((r) => r.status === 'draft').length

  const selectedCount =
    rowSelection.type === 'include' ? rowSelection.rowKeys.length : rows.length - rowSelection.rowKeys.length

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.date || !Number.isFinite(amount) || form.amount === '') {
      setMessage('日付と金額を入力してください')
      return
    }
    const row: Expense = {
      id: newId(),
      date: form.date,
      category: form.category,
      amount,
      taxType: form.taxType,
      receipt: false,
      memo: form.memo,
      status: 'draft',
    }
    gridRef.current?.applyRows([...rows, row])
    setForm({ ...emptyForm(), date: form.date })
    setMessage(`追加しました(${formatYen(amount)})`)
  }

  const deleteSelected = () => {
    const keys = new Set(gridRef.current?.getSelectedRowKeys() ?? [])
    if (keys.size === 0) return
    gridRef.current?.applyRows(rows.filter((r) => !keys.has(r.id)))
    gridRef.current?.clearRowSelection()
    setMessage(`${keys.size} 件を削除しました`)
  }

  const submitSelected = () => {
    const keys = new Set(gridRef.current?.getSelectedRowKeys() ?? [])
    if (keys.size === 0) return
    const invalid = (gridRef.current?.getInvalidCells() ?? []).filter((c) => keys.has(String(c.rowKey)))
    if (invalid.length > 0) {
      setMessage(`入力に誤りがあります: ${[...new Set(invalid.map((c) => c.message))].join(' / ')}`)
      return
    }
    gridRef.current?.applyRows(rows.map((r) => (keys.has(r.id) ? { ...r, status: 'submitted' as const } : r)))
    gridRef.current?.clearRowSelection()
    setMessage(`${keys.size} 件を提出しました`)
  }

  const exportCsv = () => {
    gridRef.current?.downloadCsv('expenses.csv', { includeTotalRow: true, escapeFormulas: true })
  }

  const inputCls =
    'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const btnCls =
    'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40'
  const subBtnCls =
    'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700'

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">経費精算</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            全 {rows.length} 件(下書き {draftCount} 件)/ 合計 <span data-testid="header-total">{formatYen(total)}</span>
          </p>
        </div>
        <button type="button" className={subBtnCls} onClick={toggleDark} data-testid="dark-toggle">
          {dark ? 'ライト' : 'ダーク'}
        </button>
      </header>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800" data-testid="add-form">
        <label className="flex flex-col text-xs">
          日付
          <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} name="date" />
        </label>
        <label className="flex flex-col text-xs">
          区分
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} name="category">
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          金額
          <input className={`${inputCls} w-28 text-right`} inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} name="amount" placeholder="0" />
        </label>
        <label className="flex flex-col text-xs">
          税区分
          <select className={inputCls} value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value })} name="taxType">
            {TAX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col text-xs">
          摘要
          <input className={inputCls} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} name="memo" />
        </label>
        <button type="submit" className={btnCls} data-testid="add-btn">経費を追加</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={subBtnCls} disabled={!undoState.canUndo} onClick={() => gridRef.current?.undo()} data-testid="undo-btn">元に戻す</button>
        <button type="button" className={subBtnCls} disabled={!undoState.canRedo} onClick={() => gridRef.current?.redo()} data-testid="redo-btn">やり直し</button>
        <span className="mx-2 h-5 w-px bg-slate-300 dark:bg-slate-600" />
        <button type="button" className={subBtnCls} disabled={selectedCount === 0} onClick={submitSelected} data-testid="submit-btn">選択を提出</button>
        <button type="button" className={subBtnCls} disabled={selectedCount === 0} onClick={deleteSelected} data-testid="delete-btn">選択を削除</button>
        <span className="text-sm text-slate-500" data-testid="selected-count">{selectedCount} 件選択</span>
        <span className="flex-1" />
        <button type="button" className={subBtnCls} onClick={exportCsv} data-testid="csv-btn">CSV 出力</button>
      </div>
      {message && <p className="text-sm text-blue-700 dark:text-blue-300" data-testid="message">{message}</p>}

      <div className="min-h-0 flex-1">
        <SpreadsheetGrid<Expense>
          ref={gridRef}
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          height="100%"
          theme="class"
          autoHeight
          totalRow
          fillHandle
          imeDirectInput
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          canEditCell={(_r, _c, row) => row.status !== 'submitted'}
          dimReadOnlyCells
          onUndoRedoStateChange={setUndoState}
          createRow={() => ({
            id: newId(),
            date: null,
            category: 'other',
            amount: null,
            taxType: 'taxable10',
            receipt: false,
            memo: '',
            status: 'draft',
          })}
          ariaLabel="経費の一覧"
        />
      </div>
    </div>
  )
}
