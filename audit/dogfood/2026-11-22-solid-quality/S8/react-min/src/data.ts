// 会議室の予約のサンプルデータ。乱数の種を固定して、サーバーとブラウザで同じデータになるようにする。
export type Room = { id: string; name: string; capacity: number; floor: number }

export type Booking = {
  id: number
  date: string // 'YYYY-MM-DD'
  start: string // 'HH:MM'
  end: string // 'HH:MM'
  room: string // Room.id
  organizer: string
  attendees: number | null
  purpose: string
  /** 予約を登録した時刻(サーバーの DB から来た Date) */
  createdAt: Date
}

export const ROOMS: Room[] = [
  { id: 'A', name: '会議室 A', capacity: 4, floor: 3 },
  { id: 'B', name: '会議室 B', capacity: 6, floor: 3 },
  { id: 'C', name: '会議室 C', capacity: 10, floor: 4 },
  { id: 'D', name: '大会議室', capacity: 30, floor: 5 },
  { id: 'E', name: '応接室', capacity: 4, floor: 5 },
]

const PEOPLE = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田']
const PURPOSES = ['定例会議', '1on1', '採用面接', '顧客打ち合わせ', '企画レビュー', '勉強会', '予算会議', '週次ふりかえり', '外部パートナーとの打ち合わせ']

function createRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateKey(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}

/** 2026-10-01 から 2026-12-31 まで、毎日 6〜14 件の予約を作る(時刻は日本時間の業務時間) */
export function createBookings(): Booking[] {
  const random = createRandom(20261122)
  const rows: Booking[] = []
  let id = 1
  const startDay = Date.UTC(2026, 9, 1)
  const endDay = Date.UTC(2026, 11, 31)
  for (let t = startDay; t <= endDay; t += 86_400_000) {
    const day = new Date(t)
    const weekday = day.getUTCDay()
    const count = weekday === 0 || weekday === 6 ? 1 + Math.floor(random() * 2) : 6 + Math.floor(random() * 9)
    for (let i = 0; i < count; i++) {
      const room = ROOMS[Math.floor(random() * ROOMS.length)]!
      const startHour = 9 + Math.floor(random() * 9)
      const startMin = random() < 0.5 ? 0 : 30
      const length = [30, 60, 60, 90, 120][Math.floor(random() * 5)]!
      const endTotal = startHour * 60 + startMin + length
      const date = toDateKey(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())
      // 登録した時刻: 予約日の 1〜20 日前の 日本時間 9:00〜18:59(UTC で持つ)
      const daysBefore = 1 + Math.floor(random() * 20)
      const createdAt = new Date(t - daysBefore * 86_400_000 + (Math.floor(random() * 10) * 60 + Math.floor(random() * 60)) * 60_000)
      rows.push({
        id: id++,
        date,
        start: `${pad(startHour)}:${pad(startMin)}`,
        end: `${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}`,
        room: room.id,
        organizer: PEOPLE[Math.floor(random() * PEOPLE.length)]!,
        attendees: 1 + Math.floor(random() * room.capacity),
        purpose: PURPOSES[Math.floor(random() * PURPOSES.length)]!,
        createdAt,
      })
    }
  }
  // 日付と開始時刻の順に並べる
  rows.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : a.date + a.start > b.date + b.start ? 1 : 0))
  return rows
}

export const roomById = (id: unknown) => ROOMS.find((room) => room.id === id)
