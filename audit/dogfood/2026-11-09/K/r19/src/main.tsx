import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { InventoryPanel } from './InventoryPanel'
import { makeItems } from './inventory'

const exports: string[] = []
;(window as unknown as { __csv: string[] }).__csv = exports

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>在庫一覧</h1>
      <InventoryPanel initialItems={makeItems(2000)} height={480} onExport={(csv) => exports.push(csv)} />
    </main>
  </StrictMode>,
)
