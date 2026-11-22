// Orders and their lines (generated)
export type OrderStatus = 'Draft' | 'Confirmed' | 'Shipped' | 'Cancelled'
export type LineStatus = 'Open' | 'Picked' | 'Shipped'

export type Order = {
  id: string
  code: string
  customer: string
  date: string
  status: OrderStatus
  qty: number
  amount: number
  note: string
}

export type Line = {
  id: string
  orderId: string
  code: string
  product: string
  date: string
  status: LineStatus
  qty: number
  unitPrice: number
  note: string
}

export const ORDER_STATUSES: OrderStatus[] = ['Draft', 'Confirmed', 'Shipped', 'Cancelled']
export const LINE_STATUSES: LineStatus[] = ['Open', 'Picked', 'Shipped']
const CUSTOMERS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark Industries', 'Wayne Enterprises', 'Wonka']
export const PRODUCTS = ['Bolt M6', 'Nut M6', 'Washer', 'Bracket', 'Hinge', 'Spring', 'Gear 20T', 'Bearing 608', 'Shaft 8mm', 'Pulley']
const PRICES: Record<string, number> = { 'Bolt M6': 12, 'Nut M6': 8, Washer: 3, Bracket: 240, Hinge: 180, Spring: 45, 'Gear 20T': 620, 'Bearing 608': 150, 'Shaft 8mm': 900, Pulley: 410 }

function rnd(seed: number) {
  let s = seed
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function createData(orderCount: number) {
  const r = rnd(42)
  const orders: Order[] = []
  const lines: Record<string, Line[]> = {}
  for (let i = 0; i < orderCount; i++) {
    const id = `O${String(i + 1).padStart(5, '0')}`
    const date = new Date(2026, 9, 1 + Math.floor(r() * 50))
    const n = 1 + Math.floor(r() * 30)
    const ls: Line[] = []
    for (let j = 0; j < n; j++) {
      const product = PRODUCTS[Math.floor(r() * PRODUCTS.length)]!
      ls.push({
        id: `${id}-${j + 1}`,
        orderId: id,
        code: String((j + 1) * 10),
        product,
        date: iso(new Date(date.getTime() + Math.floor(r() * 20) * 86400000)),
        status: LINE_STATUSES[Math.floor(r() * 3)]!,
        qty: 1 + Math.floor(r() * 50),
        unitPrice: PRICES[product]!,
        note: '',
      })
    }
    lines[id] = ls
    const t = totals(ls)
    orders.push({ id, code: id, customer: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)]!, date: iso(date), status: ORDER_STATUSES[Math.floor(r() * 4)]!, qty: t.qty, amount: t.amount, note: '' })
  }
  return { orders, lines }
}

export function totals(ls: readonly Line[]) {
  let qty = 0
  let amount = 0
  for (const l of ls) {
    qty += Number(l.qty) || 0
    amount += (Number(l.qty) || 0) * (Number(l.unitPrice) || 0)
  }
  return { qty, amount }
}

export const priceOf = (product: string) => PRICES[product] ?? 0
