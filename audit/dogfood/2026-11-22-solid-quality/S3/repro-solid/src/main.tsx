// S3 の最小再現(Solid 版)。?s=focus | dialog
import { render } from '@solidjs/web'
import { createSignal, onSettled, Show } from 'solid-js'
import { SpreadsheetGrid, createSpreadsheetGrid, standardFeatures, contextMenuFeature, fillHandleFeature, findFeature, rowDragFeature, type CellEditorContext, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; city: string }
const initial: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `item ${i + 1}`, city: `city-${i + 1}` }))
const blurMode = new URLSearchParams(location.search).get('blur') ?? 'cancel'

// custom エディタ: 入力欄 1 つ。Enter で確定、Escape で取消、フォーカスが外れたら cancel(?blur=commit なら commit)
function CityEditor(props: { ctx: CellEditorContext<Row> }) {
  let input!: HTMLInputElement
  ;(window as any).__initialText = props.ctx.initialText
  onSettled(() => {
    input.focus()
    input.select()
  })
  return (
    <input
      ref={input}
      data-testid="city-editor"
      value={props.ctx.initialText}
      style={{ width: '100%', height: '100%', 'box-sizing': 'border-box' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); props.ctx.commit(e.currentTarget.value, 'down') }
        if (e.key === 'Escape') { e.preventDefault(); props.ctx.cancel() }
      }}
      onBlur={(e) => (blurMode === 'commit' ? props.ctx.commit(e.currentTarget.value) : props.ctx.cancel())}
    />
  )
}

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160 },
  { key: 'city', title: 'City', width: 160, editor: { type: 'custom', render: (ctx) => <CityEditor ctx={ctx} /> } },
]

const q = new URLSearchParams(location.search)
const Lite = createSpreadsheetGrid({ features: { ...standardFeatures, contextMenu: contextMenuFeature, fillHandle: fillHandleFeature, find: findFeature, rowDrag: rowDragFeature } })
function Grid() {
  const [rows, setRows] = createSignal(initial)
  const G = q.has('lite') ? Lite : SpreadsheetGrid
  return (
    <G
      theme={q.has('class') ? 'class' : 'light'}
      fillHandle={q.has('fill')}
      find={q.has('find')}
      enableRowDrag={q.has('rowdrag')}
      rows={rows()}
      columns={columns}
      onRowsChange={(next) => setRows(next)}
      rowKeyGetter={(r) => r.id}
      height={300}
      enableContextMenu
      getContextMenuItems={(p) => [{ label: `menu for ${String(p.target.rowKey)}`, onSelect: () => {} }]}
    />
  )
}

function App() {
  const s = new URLSearchParams(location.search).get('s') ?? 'focus'
  const [open, setOpen] = createSignal(false)
  let dialog!: HTMLDialogElement
  return (
    <Show when={s === 'dialog'} fallback={<Grid />}>
      <button data-testid="open" onClick={() => { setOpen(true); dialog.showModal() }}>open dialog</button>
      <dialog ref={dialog} style={{ width: '500px' }} onClose={() => setOpen(false)}>
        <button onClick={() => dialog.close()}>close</button>
        <Show when={open()}><Grid /></Show>
      </dialog>
    </Show>
  )
}

render(() => <App />, document.getElementById('root')!)
