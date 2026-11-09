import { useEffect, useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { SalesTabs } from './sections/SalesTabs'
import { OrdersSplit } from './sections/OrdersSplit'
import { KpiScaled } from './sections/KpiScaled'
import { CustomerDialog } from './sections/CustomerDialog'
import { QuickStockPopover } from './sections/QuickStockPopover'
import { makeSales } from './data'

export type TabsMode = 'force' | 'unmount'

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

export function App() {
  const [dark, setDark] = useState(() => readParam('dark') === '1')
  const [tabsMode, setTabsMode] = useState<TabsMode>(() => (readParam('tabs') === 'unmount' ? 'unmount' : 'force'))
  const [mountKey, setMountKey] = useState(0)
  const [showGrids, setShowGrids] = useState(true)
  const [customer, setCustomer] = useState<string | null>(null)
  const sales = useMemo(() => makeSales(5000), [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const totals = useMemo(() => {
    let amount = 0
    let unpaid = 0
    for (const r of sales) {
      amount += r.qty * r.unitPrice
      if (!r.paid) unpaid += 1
    }
    return { amount, unpaid, count: sales.length }
  }, [sales])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <h1 className="text-lg font-bold">営業ダッシュボード</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">2026 年 11 月</span>
        <div className="ml-auto flex items-center gap-2">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" data-testid="settings-trigger">
                表示設定
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content sideOffset={6} align="end" className="z-50 w-72 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900" data-testid="settings-popover">
                <p className="mb-2 font-semibold">表示設定</p>
                <label className="flex items-center gap-2 py-1">
                  <input type="checkbox" checked={tabsMode === 'force'} onChange={(e) => setTabsMode(e.target.checked ? 'force' : 'unmount')} data-testid="tabs-force" />
                  非表示のタブも描いたままにする
                </label>
                <label className="flex items-center gap-2 py-1">
                  <input type="checkbox" checked={showGrids} onChange={(e) => setShowGrids(e.target.checked)} data-testid="show-grids" />
                  グリッドを表示する
                </label>
                <button type="button" className="mt-2 rounded border border-slate-300 px-2 py-1 dark:border-slate-700" onClick={() => setMountKey((k) => k + 1)} data-testid="remount">
                  グリッドを作り直す
                </button>
                <Popover.Arrow className="fill-white dark:fill-slate-900" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <QuickStockPopover />
          <CustomerDialog onPick={setCustomer} />
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={() => setDark((d) => !d)}
            data-testid="dark-toggle"
          >
            {dark ? 'ライト' : 'ダーク'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-8 px-6 py-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Tile label="売上合計" value={`¥${totals.amount.toLocaleString('ja-JP')}`} />
          <Tile label="受注件数" value={`${totals.count.toLocaleString('ja-JP')} 件`} />
          <Tile label="未入金" value={`${totals.unpaid.toLocaleString('ja-JP')} 件`} />
          <Tile label="選んだ顧客" value={customer ?? '—'} testId="picked-customer" />
        </section>

        {showGrids && (
          <div key={mountKey} className="space-y-8">
            <SalesTabs mode={tabsMode} initialSales={sales} />
            <OrdersSplit />
            <KpiScaled />
          </div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 font-semibold">お知らせ</h2>
          {Array.from({ length: 12 }, (_, i) => (
            <p key={i} className="py-2 text-sm leading-7 text-slate-600 dark:text-slate-400">
              {i + 1}. 年末の締めに向けて、請求済みの案件の入金確認をお願いします。未入金の案件は担当者から顧客へ連絡してください。
              倉庫の棚卸しは 12 月 20 日に行います。在庫数の修正は前日までに入力してください。
            </p>
          ))}
        </section>
      </main>
    </div>
  )
}

function Tile({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold" data-testid={testId}>
        {value}
      </div>
    </div>
  )
}
