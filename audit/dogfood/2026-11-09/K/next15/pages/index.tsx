import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import { InventoryTable } from '../components/InventoryTable'
import { makeItems, type Item } from '../lib/inventory'
import type { GridSortState } from '@ishibashi0112/spreadsheet-grid'

type Props = { items: Item[]; initialSort: GridSortState | null }

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
  const [columnKey, direction] = String(query.sort ?? '').split('.')
  const initialSort: GridSortState | null = columnKey ? [{ columnKey, direction: direction === 'desc' ? 'desc' : 'asc' }] : null
  return { props: { items: makeItems(500), initialSort } }
}

export default function Page({ items, initialSort }: Props) {
  return (
    <main>
      <Head><title>在庫一覧</title></Head>
      <h1>在庫一覧(SSR)</h1>
      <InventoryTable items={items} initialSort={initialSort ?? undefined} totalRow />
    </main>
  )
}
