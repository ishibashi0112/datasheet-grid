import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { flushSync } from 'react-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { SpreadsheetGrid, type GridRowKey, type SpreadsheetGridHandle, type UndoRedoState } from '@ishibashi0112/spreadsheet-grid'
import { salesColumns, stockColumns } from '../columns'
import { makeStock, type SaleRow, type StockRow } from '../data'
import { buildContextMenu } from '../gridMenu'
import type { TabsMode } from '../App'

const tabTrigger =
  'px-4 py-2 text-sm border-b-2 border-transparent text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 dark:text-slate-400 dark:data-[state=active]:text-indigo-300'

export function SalesTabs({ mode, initialSales }: { mode: TabsMode; initialSales: SaleRow[] }) {
  const [tab, setTab] = useState('sales')
  // タブを切り替えても編集した値が残るよう、行は親で持つ
  const [sales, setSales] = useState<SaleRow[]>(initialSales)
  // Alt+1〜3 でタブを切り替えるショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const t = ({ '1': 'sales', '2': 'stock', '3': 'chart' } as Record<string, string>)[e.key]
      if (t) {
        e.preventDefault()
        setTab(t)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const force = mode === 'force'
  const stockRef = useRef<SpreadsheetGridHandle<StockRow>>(null)
  // 「在庫の SKU-00500 を開く」: タブを切り替えて、その行を選んで見せる(?jump=a / b / c で書き方を変える)
  const jump = new URLSearchParams(window.location.search).get('jump') ?? 'b'
  const openSku = (sku: string) => {
    const go = () => {
      const g = stockRef.current
      if (!g) return
      const r = g.getViewRowIndex(sku)
      const c = g.getColIndex('name')
      g.selectCell(r, c, { scrollIntoView: true })
      g.focus()
    }
    if (jump === 'a') {
      go() // 隠れたまま先に選ぶ
      setTab('stock')
    } else if (jump === 'b') {
      setTab('stock')
      go() // 同じハンドラの中ですぐ(まだ隠れている)
    } else {
      flushSync(() => setTab('stock'))
      go()
    }
  }
  const contentClass = 'data-[state=inactive]:hidden h-[440px] flex flex-col'
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="tabs-section">
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex border-b border-slate-200 px-4 dark:border-slate-800" aria-label="明細の切り替え">
          <Tabs.Trigger value="sales" className={tabTrigger} data-testid="tab-sales">
            売上明細
          </Tabs.Trigger>
          <Tabs.Trigger value="stock" className={tabTrigger} data-testid="tab-stock">
            在庫
          </Tabs.Trigger>
          <Tabs.Trigger value="chart" className={tabTrigger} data-testid="tab-chart">
            グラフ
          </Tabs.Trigger>
          <button type="button" className="ml-auto self-center rounded border px-2 py-0.5 text-sm dark:border-slate-700" onClick={() => openSku('SKU-00500')} data-testid="jump-sku">
            SKU-00500 を在庫で開く
          </button>
        </Tabs.List>
        <Tabs.Content value="sales" forceMount={force ? true : undefined} className={contentClass}>
          <SalesGrid rows={sales} setRows={setSales} />
        </Tabs.Content>
        <Tabs.Content value="stock" forceMount={force ? true : undefined} className={contentClass}>
          <StockGrid gridRef={stockRef} />
        </Tabs.Content>
        <Tabs.Content value="chart" forceMount={force ? true : undefined} className={contentClass}>
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">(グラフは準備中)</div>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  )
}

function SalesGrid({ rows, setRows }: { rows: SaleRow[]; setRows: Dispatch<SetStateAction<SaleRow[]>> }) {
  const [undo, setUndo] = useState<UndoRedoState>({ canUndo: false, canRedo: false })
  const gridRef = useRef<SpreadsheetGridHandle<SaleRow>>(null)
  const deleteRow = (key: GridRowKey) => setRows((prev) => prev.filter((r) => r.id !== key))
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40 dark:border-slate-700" disabled={!undo.canUndo} onClick={() => gridRef.current?.undo()}>
          元に戻す
        </button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-40 dark:border-slate-700" disabled={!undo.canRedo} onClick={() => gridRef.current?.redo()}>
          やり直し
        </button>
        <button type="button" className="rounded border px-2 py-1 dark:border-slate-700" onClick={() => gridRef.current?.downloadCsv('sales.csv')}>
          CSV
        </button>
        <span className="ml-auto text-slate-500" data-testid="sales-count">
          {rows.length.toLocaleString('ja-JP')} 件
        </span>
      </div>
      <div className="min-h-0 flex-1" data-testid="sales-wrap">
        <SpreadsheetGrid
          ref={gridRef}
          ariaLabel="売上明細"
          rows={rows}
          columns={salesColumns}
          onRowsChange={setRows}
          rowKeyGetter={(r) => r.id}
          height="100%"
          theme="class"
          find
          fillHandle
          totalRow
          enableContextMenu
          getContextMenuItems={(p) => buildContextMenu(p, { onDelete: deleteRow })}
          onUndoRedoStateChange={setUndo}
          classNames={{ root: 'rounded-none border-x-0 border-b-0' }}
        />
      </div>
    </>
  )
}

function StockGrid({ gridRef }: { gridRef: RefObject<SpreadsheetGridHandle<StockRow> | null> }) {
  const [rows, setRows] = useState<StockRow[]>(() => makeStock(800))
  return (
    <div className="min-h-0 flex-1 p-3" data-testid="stock-wrap">
      <SpreadsheetGrid
        ref={gridRef}
        ariaLabel="在庫"
        rows={rows}
        columns={stockColumns}
        onRowsChange={setRows}
        rowKeyGetter={(r) => r.sku}
        height="100%"
        theme="class"
        autoSizeColumns="onMount"
        enableContextMenu
        getContextMenuItems={(p) => buildContextMenu(p, { onDelete: (k) => setRows((prev) => prev.filter((r) => r.sku !== k)) })}
      />
    </div>
  )
}
