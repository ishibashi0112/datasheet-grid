import { useState } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { SpreadsheetGrid, type GridCellRef } from '@ishibashi0112/spreadsheet-grid'
import { orderColumns } from '../columns'
import { makeOrders, type OrderRow } from '../data'
import { buildContextMenu } from '../gridMenu'

export function OrdersSplit() {
  const [rows, setRows] = useState<OrderRow[]>(() => makeOrders(2000))
  const [active, setActive] = useState<GridCellRef<OrderRow> | null>(null)
  const gridPanel = usePanelRef()
  const row = active?.row
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid="split-section">
      <div className="flex items-center border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <h2 className="font-semibold">受注一覧</h2>
        <button
          type="button"
          className="ml-auto rounded border px-2 py-0.5 text-sm dark:border-slate-700"
          onClick={() => (gridPanel.current?.isCollapsed() ? gridPanel.current.expand() : gridPanel.current?.collapse())}
          data-testid="collapse-orders"
        >
          表を畳む / 開く
        </button>
      </div>
      <div className="h-[560px]">
        <Group orientation="horizontal" id="orders-split">
          <Panel defaultSize="65" minSize="25" collapsible collapsedSize={0} panelRef={gridPanel} id="orders-grid">
            <Group orientation="vertical" id="orders-vsplit">
              <Panel defaultSize="80" minSize="20" id="orders-grid-top">
                <div className="flex h-full flex-col p-3" data-testid="orders-wrap">
                  <SpreadsheetGrid
                    ariaLabel="受注一覧"
                    rows={rows}
                    columns={orderColumns}
                    onRowsChange={setRows}
                    rowKeyGetter={(r) => r.orderNo}
                    height="100%"
                    theme="class"
                    hoverHighlight="cross"
                    onActiveCellChange={setActive}
                    enableContextMenu
                    getContextMenuItems={(p) => buildContextMenu(p, { onDelete: (k) => setRows((prev) => prev.filter((r) => r.orderNo !== k)) })}
                  />
                </div>
              </Panel>
              <Separator className="h-2 bg-slate-200 hover:bg-indigo-400 dark:bg-slate-700" data-testid="vsplit-handle" />
              <Panel minSize="10" id="orders-note">
                <div className="h-full overflow-auto p-3 text-sm text-slate-500">納期が 3 日以内の受注は赤字で表示されます(準備中)。</div>
              </Panel>
            </Group>
          </Panel>
          <Separator className="w-2 bg-slate-200 hover:bg-indigo-400 data-[separator=active]:bg-indigo-500 dark:bg-slate-700" data-testid="split-handle" />
          <Panel minSize="15" id="orders-detail">
            <div className="h-full overflow-auto p-4 text-sm" data-testid="order-detail">
              <h3 className="mb-3 font-semibold">選択中の受注</h3>
              {row ? (
                <dl className="grid grid-cols-[6em_1fr] gap-y-2">
                  <dt className="text-slate-500">受注番号</dt>
                  <dd>{row.orderNo}</dd>
                  <dt className="text-slate-500">顧客</dt>
                  <dd>{row.customer}</dd>
                  <dt className="text-slate-500">担当</dt>
                  <dd>{row.rep}</dd>
                  <dt className="text-slate-500">金額</dt>
                  <dd>¥{row.amount.toLocaleString('ja-JP')}</dd>
                  <dt className="text-slate-500">納期</dt>
                  <dd>{row.dueDate}</dd>
                </dl>
              ) : (
                <p className="text-slate-500">表のセルを選ぶと、ここに詳細が出ます。</p>
              )}
            </div>
          </Panel>
        </Group>
      </div>
    </section>
  )
}
