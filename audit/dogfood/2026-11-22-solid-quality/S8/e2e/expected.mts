import { createBookings } from '../src/data.ts'
const rows = createBookings()
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inRange = rows.filter((r) => { const k = key(r.createdAt); return k >= '2026-11-01' && k <= '2026-11-03' })
const on2 = rows.filter((r) => key(r.createdAt) === '2026-11-02')
console.log(process.env.TZ, 'range', inRange.length, inRange.slice(0, 4).map((r) => r.date), 'set', on2.length, on2.slice(0,4).map(r=>r.date))
const today = key(new Date())
console.log('today', today, rows.filter((r) => r.date === today).length)
