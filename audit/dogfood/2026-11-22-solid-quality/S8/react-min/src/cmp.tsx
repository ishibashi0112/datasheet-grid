// React 版 1.2.1 の比べるアプリ(Solid の S8 の予約表と同じ列・同じ初期状態。ルーターは無し)
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { ROOMS, createBookings, roomById, type Booking } from './data'
import { stateFromQuery, type UrlQuery } from './urlState'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

/** 'YYYY-MM-DD' → '2026/11/22(日)'(タイムゾーンに依らないよう UTC で曜日を出す) */
function formatDate(value: unknown) {
  if (typeof value !== 'string') return value == null ? '' : String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return `${m[1]}/${m[2]}/${m[3]}(${WEEKDAYS[day]})`
}

const createdFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export const bookingColumns: GridColumn<Booking>[] = [
  {
    key: 'date',
    title: '日付',
    width: 140,
    pinned: 'left',
    editor: { type: 'date' },
    filterType: 'dateSet',
    valueFormatter: ({ value }) => formatDate(value),
    validate: ({ value }) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) || '日付を入れてください',
  },
  {
    key: 'start',
    title: '開始',
    width: 80,
    align: 'center',
    validate: ({ value }) => (typeof value === 'string' && TIME_RE.test(value)) || '「9:30」の形で入れてください',
  },
  {
    key: 'end',
    title: '終了',
    width: 80,
    align: 'center',
    validate: ({ value, row }) => {
      if (typeof value !== 'string' || !TIME_RE.test(value)) return '「10:30」の形で入れてください'
      const toMin = (s: string) => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1])
      return typeof row.start !== 'string' || !TIME_RE.test(row.start) || toMin(value) > toMin(row.start) || '開始より後の時刻にしてください'
    },
  },
  {
    key: 'room',
    title: '部屋',
    width: 130,
    editor: { type: 'select', options: ROOMS.map((room) => ({ value: room.id, label: `${room.name}(${room.capacity}名)` })) },
    valueFormatter: ({ value }) => roomById(value)?.name ?? String(value ?? ''),
    filterType: 'set',
    filterOptions: ROOMS.map((room) => ({ value: room.id, label: room.name })),
  },
  { key: 'organizer', title: '予約者', width: 110, filterType: 'textSet' },
  {
    key: 'attendees',
    title: '人数',
    width: 80,
    align: 'right',
    editor: { type: 'number', min: 1, integer: true },
    filterType: 'numberSet',
    aggFunc: 'sum',
    validate: ({ value, row }) => {
      const room = roomById(row.room)
      return value == null || !room || Number(value) <= room.capacity || `${room.name}の定員(${room.capacity}名)を超えています`
    },
  },
  { key: 'purpose', title: '用途', width: 200, minWidth: 160, flex: 1, editor: { type: 'text', multiline: true }, filterType: 'text' },
  {
    key: 'createdAt',
    title: '登録日時',
    width: 150,
    editable: false,
    filterType: 'dateSet',
    valueFormatter: ({ value }) => (value instanceof Date ? createdFormatter.format(value) : ''),
  },
]


function App() {
  const [rows, setRows] = useState(createBookings)
  const grid = useRef<SpreadsheetGridHandle<Booking>>(null)
  const [initialState] = useState(() => stateFromQuery(Object.fromEntries(new URLSearchParams(location.search)) as UrlQuery))
  return (
    <div className="layout">
      <div className="toolbar">
        <button type="button" onClick={() => grid.current?.applyState({ filters: { globalText: '', columnFilters: {} } })}>すべて</button>
        <button type="button" onClick={() => grid.current?.downloadCsv('bookings.csv')}>CSV</button>
      </div>
      <div className="grid-area">
        <SpreadsheetGrid ref={(h) => { grid.current = h; (globalThis as { __grid?: unknown }).__grid = h }} rows={rows} columns={bookingColumns} onRowsChange={setRows} rowKeyGetter={(row) => row.id}
          initialState={initialState} height="100%" totalRow enableContextMenu find />
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
