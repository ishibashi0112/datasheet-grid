import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { SpreadsheetGrid, type GridCellRef, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { customerColumns } from '../columns'
import { makeCustomers, type CustomerRow } from '../data'
import { buildContextMenu } from '../gridMenu'

// 回避策の切り替え(?dlg=w1 / w2)。w1 = modal のまま、ポップアップを押せるようにして外側の判定から外す。w2 = modal={false}
const DLG = new URLSearchParams(window.location.search).get('dlg')
const isGridPortal = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('.ssg-menu-panel, .ssg-select-editor-popover, .ssg-popover, [class*="ssg-"]')

export function CustomerDialog({ onPick }: { onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CustomerRow[]>(() => makeCustomers(300))
  const [active, setActive] = useState<GridCellRef<CustomerRow> | null>(null)
  const [log, setLog] = useState<string[]>([])
  const gridRef = useRef<SpreadsheetGridHandle<CustomerRow>>(null)
  const addLog = (m: string) => setLog((l) => [m, ...l].slice(0, 5))
  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={DLG === 'w2' ? false : undefined}>
      <Dialog.Trigger asChild>
        <button type="button" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500" data-testid="dialog-open">
          顧客を選ぶ…
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="dlg-anim fixed left-1/2 top-1/2 z-50 flex h-[560px] w-[min(960px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900"
          data-testid="dialog"
          onInteractOutside={DLG ? (e) => { if (isGridPortal(e.target)) e.preventDefault() } : undefined}
          onEscapeKeyDown={DLG ? (e) => { if (e.target instanceof Element && (e.target.closest('.ssg-root') || isGridPortal(e.target))) e.preventDefault() } : undefined}
        >
          <Dialog.Title className="text-base font-semibold">顧客マスタから選ぶ</Dialog.Title>
          <Dialog.Description className="mb-3 text-sm text-slate-500">行を選んで「決定」を押してください。地域やランクはその場で直せます。</Dialog.Description>
          <div className="min-h-0 flex-1" data-testid="dialog-grid-wrap">
            {DLG === 'nogrid' ? (
              <div className="ssg-root h-full overflow-auto">{rows.slice(0, 40).map((r) => <div key={r.code}><input defaultValue={r.name} /></div>)}</div>
            ) : (
            <SpreadsheetGrid
              ref={gridRef}
              ariaLabel="顧客マスタ"
              rows={rows}
              columns={customerColumns}
              onRowsChange={setRows}
              rowKeyGetter={(r) => r.code}
              height="100%"
              theme="class"
              onActiveCellChange={setActive}
              classNames={DLG === 'w1' ? { popover: { style: { pointerEvents: 'auto' } } } : undefined}
              enableContextMenu
              getContextMenuItems={(p) => buildContextMenu(p, { onDelete: (k) => setRows((prev) => prev.filter((r) => r.code !== k)), onLog: addLog })}
            />
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500" data-testid="dialog-log">
              {log[0] ?? ''}
            </span>
            <Dialog.Close asChild>
              <button type="button" className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">
                閉じる
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
              disabled={!active}
              onClick={() => {
                if (active) onPick(active.row.name)
                setOpen(false)
              }}
              data-testid="dialog-ok"
            >
              決定
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
