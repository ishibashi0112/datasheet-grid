import type { GetStaticProps } from 'next'
import { InventoryTable } from '../components/InventoryTable'
import { makeItems, type Item } from '../lib/inventory'

export const getStaticProps: GetStaticProps<{ items: Item[] }> = async () => ({ props: { items: makeItems(200) } })

export default function Page({ items }: { items: Item[] }) {
  return (
    <main>
      <h1>Inventory (SSG, English)</h1>
      <InventoryTable items={items} english />
    </main>
  )
}
