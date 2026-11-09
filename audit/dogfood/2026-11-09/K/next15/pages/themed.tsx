// ページのファイルから node_modules の CSS(テーマ)を読む
import '@ishibashi0112/spreadsheet-grid/themes/shadcn.css'
import { InventoryTable } from '../components/InventoryTable'
import { makeItems } from '../lib/inventory'

export default function Page() {
  return (
    <main style={{ ['--background' as string]: 'oklch(1 0 0)' }}>
      <h1>shadcn テーマ</h1>
      <InventoryTable items={makeItems(30)} />
    </main>
  )
}
