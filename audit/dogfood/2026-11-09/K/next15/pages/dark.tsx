import Head from 'next/head'
import { useEffect } from 'react'
import { InventoryTable } from '../components/InventoryTable'
import { makeItems } from '../lib/inventory'

export default function Page() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])
  return (
    <main>
      <Head><title>dark</title></Head>
      <h1>ダーク</h1>
      <InventoryTable items={makeItems(50)} />
    </main>
  )
}
