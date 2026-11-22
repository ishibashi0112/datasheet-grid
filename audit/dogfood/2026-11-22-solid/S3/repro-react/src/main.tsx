// S3 の最小再現(React 版 1.2.1)。?s=focus | dialog
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { SpreadsheetGrid, type CellEditorContext, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; city: string }
const initial: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, city: `city-${i + 1}` }))
const blurMode = new URLSearchParams(location.search).get('blur') ?? 'cancel'

function CityEditor({ ctx }: { ctx: CellEditorContext<Row> }) {
  const input = useRef<HTMLInputElement>(null)
  ;(window as any).__initialText = ctx.initialText
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <input
      ref={input}
      data-testid="city-editor"
      defaultValue={ctx.initialText}
      style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ctx.commit(e.currentTarget.value, 'down') }
        if (e.key === 'Escape') { e.preventDefault(); ctx.cancel() }
      }}
      onBlur={(e) => (blurMode === 'commit' ? ctx.commit(e.currentTarget.value) : ctx.cancel())}
    />
  )
}

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160 },
  { key: 'city', title: 'City', width: 160, editor: { type: 'custom', render: (ctx) => <CityEditor ctx={ctx} /> } },
]

function Grid() {
  const [rows, setRows] = useState(initial)
  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(r) => r.id}
      height={300}
      enableContextMenu
      getContextMenuItems={(p) => [{ label: `menu for ${String(p.target.rowKey)}`, onSelect: () => {} }]}
    />
  )
}

function App() {
  const s = new URLSearchParams(location.search).get('s') ?? 'focus'
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  if (s !== 'dialog') return <Grid />
  return (
    <>
      <button data-testid="open" onClick={() => { setOpen(true); dialog.current?.showModal() }}>open dialog</button>
      <dialog ref={dialog} style={{ width: 500 }} onClose={() => setOpen(false)}>
        <button onClick={() => dialog.current?.close()}>close</button>
        {open && <Grid />}
      </dialog>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
