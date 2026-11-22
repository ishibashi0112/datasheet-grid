import { createSignal, Match, Switch } from 'solid-js'
import { SignalPage, StorePage } from './pages'

type Tab = 'signal' | 'store' | 'none'

export function App() {
  const initial = (new URLSearchParams(location.search).get('tab') as Tab | null) ?? 'signal'
  const [tab, setTab] = createSignal<Tab>(initial)
  const tabBtn = (t: Tab, label: string) => (
    <button
      id={`tab-${t}`}
      class={[
        'rounded-t border-b-2 px-3 py-1 text-sm',
        { 'border-sky-600 font-semibold': tab() === t, 'border-transparent': tab() !== t },
      ]}
      onClick={() => setTab(t)}
    >
      {label}
    </button>
  )
  return (
    <div class="box-border flex h-full flex-col gap-2 p-3">
      <header class="flex items-center gap-3">
        <h1 class="text-lg font-bold">在庫・発注表</h1>
        <nav class="flex gap-1">
          {tabBtn('signal', 'signal 版')}
          {tabBtn('store', 'store 版')}
          {tabBtn('none', '(グリッドなし)')}
        </nav>
      </header>
      <main class="min-h-0 flex-1">
        <Switch>
          <Match when={tab() === 'signal'}>
            <SignalPage />
          </Match>
          <Match when={tab() === 'store'}>
            <StorePage />
          </Match>
          <Match when={tab() === 'none'}>
            <p>グリッドはアンマウントされています。</p>
          </Match>
        </Switch>
      </main>
    </div>
  )
}
