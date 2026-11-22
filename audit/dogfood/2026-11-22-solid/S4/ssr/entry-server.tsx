import { renderToString, renderToStream } from '@solidjs/web'
import { InventoryGrid } from '../src/InventoryGrid'
import { makeItems } from '../src/inventory'

export function renderGrid() {
  return renderToString(() => <InventoryGrid initialRows={makeItems(20)} />)
}
export async function renderGridStream() {
  return await renderToStream(() => <InventoryGrid initialRows={makeItems(20)} />)
}
