import { forwardRef, useRef, useState } from 'react'
import { SpreadsheetGrid, type SpreadsheetGridHandle, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../lib/inventory'

// よくある「包む部品」: props を広げて渡すだけ(React 19 なら ref も届く)
type GridProps = Omit<SpreadsheetGridProps<Item>, 'columns'>
function PlainWrapper(props: GridProps) {
  return <SpreadsheetGrid<Item> columns={inventoryColumns} rowKeyGetter={(r) => r.id} {...props} />
}
// ドキュメントどおり forwardRef で包む
const ForwardWrapper = forwardRef<SpreadsheetGridHandle<Item>, GridProps>(function ForwardWrapper(props, ref) {
  return <SpreadsheetGrid<Item> ref={ref} columns={inventoryColumns} rowKeyGetter={(r) => r.id} {...props} />
})

export default function Page() {
  const [rows] = useState(() => makeItems(20))
  const plainRef = useRef<SpreadsheetGridHandle<Item>>(null)
  const fwdRef = useRef<SpreadsheetGridHandle<Item>>(null)
  const [out, setOut] = useState('')
  return (
    <main>
      <button type="button" onClick={() => setOut(`plain=${plainRef.current ? 'set' : 'null'} forward=${fwdRef.current ? 'set' : 'null'}`)}>ref を確かめる</button>
      <output data-testid="out">{out}</output>
      <div style={{ height: 240 }}><PlainWrapper ref={plainRef} rows={rows} height="100%" ariaLabel="plain" /></div>
      <div style={{ height: 240 }}><ForwardWrapper ref={fwdRef} rows={rows} height="100%" ariaLabel="forward" /></div>
    </main>
  )
}
