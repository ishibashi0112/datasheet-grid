// 操作ログ(clientSide)。並び・フィルターは URL と同期し、SSR で initialState から描く
import { createEffect, createSignal, untrack } from 'solid-js'
import { useLocation, useSearchParams } from '@solidjs/router'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'
import { parseUrlState, sameState, toSearch } from '../urlState'
import { theme } from '../settings'

export type Activity = { id: number; at: string; user: string; action: string; detail: string }

const ACTIONS = ['login', 'logout', 'update', 'export', 'invite']
const pad = (n: number) => String(n).padStart(2, '0')
// 決まった日付(2026-10-11〜2026-11-24)。サーバーとクライアントで同じデータになる
function makeActivities(): Activity[] {
  const base = Date.UTC(2026, 9, 11)
  const out: Activity[] = []
  // 日ごとに件数を変える(30〜89 件 × 45 日)
  for (let day = 0; day < 45; day++) {
    const d = new Date(base + day * 86400000)
    const at = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    const n = 30 + ((day * 37) % 60)
    for (let k = 0; k < n; k++) {
      const i = out.length
      out.push({ id: i + 1, at, user: `user${(i * 31) % 500}@example.com`, action: ACTIONS[i % ACTIONS.length]!, detail: `event #${i + 1}` })
    }
  }
  return out
}

const columns: GridColumn<Activity>[] = [
  { key: 'id', title: 'ID', width: 80, align: 'right' },
  { key: 'at', title: 'Date', width: 130, filterType: 'dateSet' },
  { key: 'user', title: 'User', width: 220, filterType: 'text' },
  { key: 'action', title: 'Action', width: 120, filterType: 'set' },
  { key: 'detail', title: 'Detail', width: 200 },
]

export default function ActivityPage() {
  const [search, setSearch] = useSearchParams()
  const location = useLocation()
  const initial = untrack(() => parseUrlState({ ...search } as Record<string, string>))
  const [rows, setRows] = createSignal(makeActivities())
  let grid!: SpreadsheetGridHandle<Activity>

  createEffect(
    () => location.search,
    () => {
      const fromUrl = parseUrlState(untrack(() => ({ ...search }) as Record<string, string>))
      if (!sameState(grid.getState(), fromUrl)) grid.applyState({ sort: fromUrl.sort, filters: fromUrl.filters })
    },
    { defer: true },
  )
  const syncToUrl = () => {
    const st = grid.getState()
    if (sameState(st, parseUrlState({ ...search } as Record<string, string>))) return
    setSearch(toSearch(st))
  }

  return (
    <section class="page">
      <div class="toolbar">
        <h1>Activity</h1>
        <a href='/activity?f={"at":{"kind":"dateSet","condition":{"mode":"preset","preset":"today"},"set":null}}'>Today</a>
        <a href='/activity?f={"at":{"kind":"dateSet","condition":{"mode":"preset","preset":"thisMonth"},"set":null}}'>This month</a>
      </div>
      <div class="grid-area">
        <SpreadsheetGrid
          ref={grid}
          rows={rows()}
          onRowsChange={(next) => setRows(next)}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          localeText={localeTextEn}
          initialState={initial}
          theme={theme()}
          height="100%"
          onSortChange={syncToUrl}
          onFiltersChange={syncToUrl}
          ariaLabel="Activity"
        />
      </div>
    </section>
  )
}