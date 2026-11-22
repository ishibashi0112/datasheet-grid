// 最小再現: SSR → hydrate したグリッドが本番だけ動かない。?wrap=loading / ?wrap=show / ?css で切り替え
import { createSignal, isHydrating, Loading, onSettled, Show } from 'solid-js'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'

type Row = { id: number; at: string }
export const ROWS: Row[] = [
  ...Array.from({ length: 2 }, (_, i) => ({ id: i + 1, at: '2026-11-21' })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: i + 11, at: '2026-11-22' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: i + 21, at: '2026-11-23' })),
]
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'at', title: 'Date', width: 140, filterType: 'dateSet' },
]
function Probe() {
  onSettled(() => { console.log('probe settled; hydrating=', isHydrating()) })
  return <span id="probe">probe</span>
}
export function App(props: { q: string }) {
  if (typeof window !== 'undefined') queueMicrotask(() => console.log('microtask hydrating=', isHydrating()))
  const [rows, setRows] = createSignal(ROWS)
  const [n, setN] = createSignal(0)
  const preset = props.q.includes('preset')
  const grid = () => (
    <SpreadsheetGrid
      rows={rows()}
      onRowsChange={setRows}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      initialState={preset ? { filters: { globalText: '', columnFilters: { at: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null } } } } : undefined}
      theme={props.q.includes('auto') ? 'auto' : undefined}
      height="100%"
      localeText={props.q.includes('en') ? localeTextEn : undefined}
      ref={props.q.includes('ref') ? (h: SpreadsheetGridHandle<Row>) => { (globalThis as any).__grid = h } : undefined}
      onSortChange={props.q.includes('cb') ? () => {} : undefined}
      ariaLabel={props.q.includes('aria') ? 'Activity' : undefined}
    />
  )
  return (
    <div style={{ height: '400px' }}>
      <Probe />
      <button id="btn" onClick={() => setN((x) => x + 1)}>clicked {n()}</button>
      {props.q.includes('wrap=loading') ? <Loading fallback={<p>loading</p>}>{grid()}</Loading> : props.q.includes('wrap=show') ? <Show when={true}>{grid()}</Show> : grid()}
    </div>
  )
}
