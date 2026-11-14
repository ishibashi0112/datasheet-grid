export type ExpenseStatus = 'draft' | 'submitted'

export type Expense = {
  id: string
  date: string | null // 'YYYY-MM-DD'
  category: string
  amount: number | null
  taxType: string
  receipt: boolean
  memo: string
  status: ExpenseStatus
}

export const CATEGORY_OPTIONS = [
  { value: 'transport', label: '交通費' },
  { value: 'meal', label: '会議費' },
  { value: 'entertainment', label: '交際費' },
  { value: 'lodging', label: '宿泊費' },
  { value: 'supplies', label: '消耗品費' },
  { value: 'other', label: 'その他' },
]

export const TAX_OPTIONS = [
  { value: 'taxable10', label: '課税 10%' },
  { value: 'reduced8', label: '軽減 8%' },
  { value: 'exempt', label: '非課税' },
]

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: '下書き',
  submitted: '提出済み',
}

let seq = 0
export function newId() {
  seq += 1
  return `e-${Date.now().toString(36)}-${seq}`
}

const MEMOS = [
  '新宿→品川 打合せ',
  '顧客訪問(横浜)\n往復',
  'A社 山田様 他2名',
  'ボールペン・付箋',
  '大阪出張 1泊',
  '社内勉強会 弁当',
  'タクシー(深夜)',
  '',
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function makeInitialRows(count = 40): Expense[] {
  const rows: Expense[] = []
  // 決まった値で作る(テストで合計を確かめやすくするため)
  for (let i = 0; i < count; i += 1) {
    const cat = CATEGORY_OPTIONS[i % CATEGORY_OPTIONS.length]
    const day = ((i * 7) % 28) + 1
    const month = i < 20 ? 10 : 11
    const amount = 300 + ((i * i * 7919 + i * 131) % 47) * 1000 + ((i * 37) % 10) * 10
    rows.push({
      id: `seed-${i + 1}`,
      date: `2026-${pad(month)}-${pad(day)}`,
      category: cat.value,
      amount,
      taxType: cat.value === 'transport' ? 'exempt' : cat.value === 'meal' ? 'reduced8' : 'taxable10',
      receipt: amount >= 30000 ? i % 3 !== 0 : i % 2 === 0,
      memo: MEMOS[i % MEMOS.length],
      status: i < 12 ? 'submitted' : 'draft',
    })
  }
  return rows
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
