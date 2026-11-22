// 最小の再現: 同じグリッドを Shadow root の中と、ふつうの DOM に 1 つずつ描く
import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import css from '@ishibashi0112/spreadsheet-grid-solid/style.css?inline'

type Row = { id: number; name: string; qty: number }
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 120, cellNote: ({ row }) => (row.id === 1 ? 'メモ: 要確認' : undefined) },
  { key: 'qty', title: '数', width: 80, filterType: 'number' },
]

function App(props: { popupContainer?: HTMLElement }) {
  const [rows, setRows] = createSignal<Row[]>(Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `とても長い品名の例 ${i + 1} で、セルからはみ出す文字`, qty: i })))
  let grid: SpreadsheetGridHandle<Row> | undefined
  return (
    <SpreadsheetGrid
      ref={(h) => (grid = h)}
      enableContextMenu
      getContextMenuItems={() => [{ label: 'いち' }, { label: 'に' }, { label: 'さん' }, { label: 'フィルターを管理', onSelect: () => grid?.openFilterManager() }]}
      rows={rows()}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(r) => r.id}
      height="100%"
      showCellOverflowTooltip
      imeDirectInput
      popupContainer={props.popupContainer}
    />
  )
}

customElements.define('min-grid', class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = css + '\n.mount{height:100%}'
    const mount = document.createElement('div')
    mount.className = 'mount'
    const popups = document.createElement('div')
    root.append(style, mount, popups)
    render(() => <App popupContainer={new URLSearchParams(location.search).get('popup') === 'auto' ? undefined : popups} />, mount)
  }
})
const plainStyle = document.createElement('style')
plainStyle.textContent = css
document.head.append(plainStyle)
render(() => <App />, document.getElementById('plain')!)
