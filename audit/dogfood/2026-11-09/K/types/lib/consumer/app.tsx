import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import {
  CompanyGrid, BigGrid, InventoryGrid, itemColumns, moneyColumn, priceColumn, yen, useInventoryGridRef,
  restoreItemColumns, companyLocaleText, companyFeatures, getStateOf, type Item,
} from '@acme/inventory-grid-kit'
import { createSpreadsheetGrid, exportFeature } from '@ishibashi0112/spreadsheet-grid/lite'

type Order = { id: number; customer: string; amount: number }
const orderColumns: GridColumn<Order>[] = [
  { key: 'customer', title: '顧客', width: 200 },
  moneyColumn<Order>('amount', '金額'),
  { key: 'x', title: 'x', width: 80, valueFormatter: yen },
]
const MyGrid = createSpreadsheetGrid({ features: { ...companyFeatures, export: exportFeature } })

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [orders] = useState<Order[]>([])
  const ref = useInventoryGridRef()
  const cols = restoreItemColumns(undefined)
  return (
    <>
      <CompanyGrid rows={items} columns={[...itemColumns, priceColumn]} onRowsChange={setItems} rowKeyGetter={(r) => r.id} localeText={companyLocaleText} />
      <BigGrid rows={orders} columns={orderColumns} rowKeyGetter={(r) => r.id} />
      <InventoryGrid rows={items} ref={ref} dense onRowsChange={setItems} />
      <SpreadsheetGrid rows={items} columns={cols} />
      <MyGrid rows={orders} columns={orderColumns} />
      <button onClick={() => ref.current && console.log(getStateOf(ref.current))}>s</button>
    </>
  )
}
// @ts-expect-error 違う型の行に Item の列
export const bad = <CompanyGrid rows={[] as Order[]} columns={itemColumns} />
