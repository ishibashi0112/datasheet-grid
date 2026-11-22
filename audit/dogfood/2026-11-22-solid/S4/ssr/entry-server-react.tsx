import { renderToString } from 'react-dom/server'
import { InventoryGrid, makeItems } from '../react/InventoryGrid'
export function renderGrid() {
  return renderToString(<InventoryGrid initialRows={makeItems(20)} />)
}
