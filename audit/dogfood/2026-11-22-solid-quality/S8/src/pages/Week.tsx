// 今週の予約: 行を非同期で読み(サーバーでは DB の代わりに 300ms 待つ)、<Loading> で包む。
// renderToStream では骨組みを先に流し、行が届いたところでグリッドを流す。
import { Loading, createSignal } from 'solid-js'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid'
import { createBookings, type Booking } from '../data'
import { bookingColumns } from './Bookings'

async function loadWeek(): Promise<Booking[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  return createBookings().filter((b) => b.date >= '2026-11-16' && b.date <= '2026-11-22')
}

export function WeekPage() {
  const [rows, setRows] = createSignal<Booking[]>(async () => loadWeek())
  return (
    <div class="grid-area">
      <Loading fallback={<p class="status" data-testid="loading">読み込み中…</p>}>
        <SpreadsheetGrid
          ref={(handle) => ((globalThis as { __grid?: unknown }).__grid = handle)}
          rows={rows()}
          columns={bookingColumns}
          onRowsChange={(next) => setRows(next)}
          rowKeyGetter={(row) => row.id}
          initialState={{ sort: [{ columnKey: 'attendees', direction: 'desc' }] }}
          height="100%"
          totalRow
        />
      </Loading>
    </div>
  )
}
