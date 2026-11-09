import { useCallback, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridCellRef,
  type GridColumn,
  type LabelRowOptions,
  type SpreadsheetGridHandle,
  type UndoRedoState,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import './app.css'
import { createInitialRows, newId, UNITS, type Item, type Row, type Section } from './data'
import { isCatalogPick, ItemNameEditor } from './ItemNameEditor'

const params = new URLSearchParams(location.search)
const EXTRA_ROWS = Number(params.get('extra') ?? 0)
const POPUP_MODE = params.get('popup') === 'portal' ? 'portal' : 'inline'
const DRAG_MOTION = params.get('drag') === 'live' ? 'live' : 'ghost'
const IME_DIRECT = params.get('ime') === '1'
const PIN_NAME = params.get('pin') === '1'

const TAX_RATE = 0.1
const yen = numberFormatter({ maximumFractionDigits: 0 })
const isSection = (row: Row): row is Section => row.kind === 'section'
const amountOf = (row: Row): number | null =>
  row.kind === 'item' && row.qty != null && row.price != null ? Math.round(row.qty * row.price) : null

const blankItem = (): Item => ({ kind: 'item', id: newId('i'), name: '', qty: null, unit: '式', price: null, note: '' })

export function App() {
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null)
  const [rows, setRows] = useState<Row[]>(() => createInitialRows(EXTRA_ROWS))
  const [undoState, setUndoState] = useState<UndoRedoState>({ canUndo: false, canRedo: false })
  const [activeCell, setActiveCell] = useState<GridCellRef<Row> | null>(null)
  const [message, setMessage] = useState('')
  const [customer, setCustomer] = useState('株式会社サンプル 御中')
  const [subject, setSubject] = useState('戸建て住宅 内装リフォーム工事')
  const [csvPreview, setCsvPreview] = useState('')

  // 区分ごとの小計(ラベル行に出す)と全体の合計
  const { sectionTotals, grandTotal } = useMemo(() => {
    const totals = new Map<string, number>()
    let current: string | null = null
    let sum = 0
    for (const row of rows) {
      if (row.kind === 'section') {
        current = row.id
        totals.set(current, 0)
        continue
      }
      const a = amountOf(row) ?? 0
      sum += a
      if (current) totals.set(current, (totals.get(current) ?? 0) + a)
    }
    return { sectionTotals: totals, grandTotal: sum }
  }, [rows])
  const tax = Math.floor(grandTotal * TAX_RATE)

  const columns = useMemo<GridColumn<Row>[]>(
    () => [
      {
        key: 'name',
        title: '品名',
        width: 260,
        pinned: PIN_NAME ? 'left' : undefined,
        validate: ({ value, row }) => row.kind !== 'item' || String(value ?? '').trim() !== '' || '品名を入力してください',
        setValue: (row, value) => {
          if (row.kind !== 'item') return row
          if (isCatalogPick(value)) {
            const c = value.catalog
            return { ...row, name: c.name, unit: c.unit, price: c.price }
          }
          return { ...row, name: String(value ?? '') }
        },
        editor: { type: 'custom', render: (ctx) => <ItemNameEditor ctx={ctx} popupMode={POPUP_MODE} /> },
      },
      {
        key: 'qty',
        title: '数量',
        width: 90,
        align: 'right',
        editor: { type: 'number', min: 0, step: 0.5 },
        valueFormatter: numberFormatter(),
      },
      {
        key: 'unit',
        title: '単位',
        width: 80,
        align: 'center',
        editor: { type: 'select', options: UNITS.map((u) => ({ label: u, value: u })) },
      },
      {
        key: 'price',
        title: '単価',
        width: 110,
        align: 'right',
        editor: { type: 'number', min: 0, integer: true },
        valueFormatter: yen,
      },
      {
        key: 'amount',
        title: '金額',
        width: 130,
        align: 'right',
        editable: false,
        getValue: amountOf,
        valueFormatter: yen,
        aggFunc: 'sum',
      },
      {
        key: 'note',
        title: '備考',
        width: 260,
        flex: 1,
        autoHeight: true,
        editor: { type: 'text', multiline: true, enterKey: 'newline' },
      },
    ],
    [],
  )

  const renameSection = useCallback(
    (id: string) => {
      const sec = rows.find((r): r is Section => r.kind === 'section' && r.id === id)
      if (!sec) return
      const label = window.prompt('区分の名前', sec.label)
      if (!label || label === sec.label) return
      gridRef.current?.applyRows(rows.map((r) => (r === sec ? { ...sec, label } : r)))
    },
    [rows],
  )
  // 区分の末尾に行を足す
  const addToSection = useCallback(
    (id: string) => {
      const grid = gridRef.current
      if (!grid) return
      const start = rows.findIndex((r) => r.kind === 'section' && r.id === id)
      let end = start + 1
      while (end < rows.length && rows[end].kind !== 'section') end++
      const newRow = blankItem()
      flushSync(() => grid.applyRows([...rows.slice(0, end), newRow, ...rows.slice(end)]))
      const v = grid.getViewRowIndex(newRow.id)
      if (v >= 0) grid.startEditing(v, grid.getColIndex('name'))
    },
    [rows],
  )

  const labelRow = useMemo<LabelRowOptions<Row, Section>>(
    () => ({
      isLabelRow: isSection,
      getLabel: (row) => row.label,
      sticky: true,
      height: 34,
      render: ({ row, label, sectionRowCount }) => (
        <span className="section-label">
          <strong>{label}</strong>
          <span className="section-label__count">{sectionRowCount ?? 0} 件</span>
          <span className="section-label__subtotal">小計 ¥{(sectionTotals.get(row.id) ?? 0).toLocaleString('ja-JP')}</span>
          <button type="button" className="section-label__btn" onClick={() => renameSection(row.id)}>
            名前を変更
          </button>
          <button type="button" className="section-label__btn" onClick={() => addToSection(row.id)}>
            ＋ 行
          </button>
        </span>
      ),
      // 名前 / 数量 / 単位 / 単価 / 金額 / 備考 の順
      exportText: (row) => [`【${row.label}】`, '', '', '小計', sectionTotals.get(row.id) ?? 0, ''],
    }),
    [sectionTotals, renameSection, addToSection],
  )

  // 指定の行(既定はアクティブセルの行)の上 / 下に行を足して品名を編集する
  const insertAt = useCallback((rowKey: string | null, where: 'above' | 'below', template?: Item) => {
    const grid = gridRef.current
    if (!grid) return
    const newRow: Item = template ? { ...template, id: newId('i') } : blankItem()
    let index = rows.length
    if (rowKey != null) {
      const src = rows.findIndex((r) => r.id === rowKey)
      if (src >= 0) index = where === 'below' ? src + 1 : src
    }
    const next = [...rows.slice(0, index), newRow, ...rows.slice(index)]
    flushSync(() => grid.applyRows(next))
    const viewRowIndex = grid.getViewRowIndex(newRow.id)
    const colIndex = grid.getColIndex('name')
    if (viewRowIndex >= 0 && colIndex >= 0) {
      const started = grid.startEditing(viewRowIndex, colIndex)
      if (!started) setMessage('編集を始められませんでした')
    }
  }, [rows])
  const insertBelow = useCallback(
    () => insertAt(activeCell ? String(activeCell.rowKey) : null, 'below'),
    [insertAt, activeCell],
  )

  const addSection = useCallback(() => {
    const label = window.prompt('区分の名前', '追加工事')
    if (!label) return
    const sec: Section = { kind: 'section', id: newId('sec'), label }
    const first = blankItem()
    const grid = gridRef.current
    if (!grid) return
    flushSync(() => grid.applyRows([...rows, sec, first]))
    const v = grid.getViewRowIndex(first.id)
    if (v >= 0) grid.startEditing(v, grid.getColIndex('name'))
  }, [rows])

  // 選んだ範囲に掛かる行(明細だけ)を消す
  const deleteSelectedRows = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return
    const selected = grid.getSelectedRows().filter((r) => r.kind === 'item')
    if (selected.length === 0) {
      setMessage('削除する行を選んでください')
      return
    }
    const ids = new Set(selected.map((r) => r.id))
    grid.applyRows(rows.filter((r) => !ids.has(r.id)))
    setMessage(`${selected.length} 行を削除しました`)
    grid.focus()
  }, [rows])

  const validateAll = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return
    const invalid = grid.getInvalidCells()
    if (invalid.length === 0) {
      setMessage('入力の誤りはありません')
      return
    }
    const first = invalid[0]
    const no = grid.getRowNumber(first.rowKey)
    setMessage(`${invalid.length} 件の誤り: ${no} 行目「${first.message}」`)
    const v = grid.getViewRowIndex(first.rowKey)
    const c = grid.getColIndex(first.columnKey)
    if (v >= 0 && c >= 0) {
      grid.selectCell(v, c, { scrollIntoView: true })
      grid.focus()
    }
  }, [])

  const exportCsv = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return
    const csv = grid.exportCsv({ includeLabelRows: true, includeTotalRow: true })
    setCsvPreview(csv)
    grid.downloadCsv('見積書.csv', { includeLabelRows: true, includeTotalRow: true })
  }, [])

  // ショートカット: Ctrl/⌘+Enter で下に行を追加、Ctrl/⌘+Delete で行を削除(編集中は除く)
  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.ssg-cell-editor')) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      insertBelow()
    } else if (mod && e.key === 'Delete') {
      e.preventDefault()
      e.stopPropagation()
      deleteSelectedRows()
    }
  }

  if (import.meta.env.DEV || params.has('debug')) {
    ;(window as unknown as { __estimate: unknown }).__estimate = { gridRef, rows, sectionTotals, grandTotal }
  }

  return (
    <div className="page">
      <header className="doc-header">
        <h1>御見積書</h1>
        <div className="doc-meta">
          <label>
            宛先
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </label>
          <label>
            件名
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </div>
        <dl className="doc-summary" data-testid="summary">
          <div>
            <dt>小計(税抜)</dt>
            <dd data-testid="subtotal">¥{grandTotal.toLocaleString('ja-JP')}</dd>
          </div>
          <div>
            <dt>消費税(10%)</dt>
            <dd>¥{tax.toLocaleString('ja-JP')}</dd>
          </div>
          <div className="doc-summary__total">
            <dt>御見積金額(税込)</dt>
            <dd data-testid="grand-total">¥{(grandTotal + tax).toLocaleString('ja-JP')}</dd>
          </div>
        </dl>
      </header>

      <div className="toolbar no-print" role="toolbar" aria-label="明細の操作">
        <button type="button" onClick={insertBelow} title="Ctrl+Enter">
          行を追加
        </button>
        <button type="button" onClick={addSection}>
          区分を追加
        </button>
        <button type="button" onClick={deleteSelectedRows} title="Ctrl+Delete">
          行を削除
        </button>
        <span className="toolbar__sep" />
        <button type="button" onClick={() => gridRef.current?.undo()} disabled={!undoState.canUndo}>
          元に戻す
        </button>
        <button type="button" onClick={() => gridRef.current?.redo()} disabled={!undoState.canRedo}>
          やり直す
        </button>
        <span className="toolbar__sep" />
        <button type="button" onClick={validateAll}>
          入力チェック
        </button>
        <button type="button" onClick={exportCsv}>
          CSV 出力
        </button>
        <button type="button" onClick={() => window.print()}>
          印刷
        </button>
        <span className="toolbar__msg" role="status">
          {message}
        </span>
      </div>

      <div className="grid-wrap" onKeyDownCapture={onKeyDownCapture}>
        <SpreadsheetGrid
          ref={gridRef}
          ariaLabel="見積明細"
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          labelRow={labelRow}
          totalRow={{ label: '合計(税抜)' }}
          enableRowDrag
          rowDragMotion={DRAG_MOTION}
          isRowDraggable={(row) => row.kind === 'item'}
          enableContextMenu
          getContextMenuItems={(params) => {
            const { target } = params
            if (target.row.kind !== 'item') return []
            const row = target.row
            const key = String(target.rowKey)
            return [
              { kind: 'label', label: row.name || '(品名なし)' },
              { label: '上に行を挿入', onSelect: () => insertAt(key, 'above') },
              { label: '下に行を挿入', onSelect: () => insertAt(key, 'below') },
              { label: 'この行を複製', onSelect: () => insertAt(key, 'below', row) },
              { kind: 'separator' },
              params.isTargetSelected
                ? { label: '選択した行を削除', danger: true, onSelect: deleteSelectedRows }
                : {
                    label: 'この行を削除',
                    danger: true,
                    onSelect: () => gridRef.current?.applyRows(rows.filter((r) => r.id !== key)),
                  },
            ]
          }}
          onUndoRedoStateChange={setUndoState}
          onActiveCellChange={setActiveCell}
          autoHeight
          imeDirectInput={IME_DIRECT}
          createRow={blankItem}
          height="100%"
          showTopBar={false}
        />
      </div>

      {csvPreview && (
        <details className="csv-preview no-print">
          <summary>CSV の中身</summary>
          <pre data-testid="csv">{csvPreview}</pre>
        </details>
      )}
    </div>
  )
}
