// 経費精算の明細データと科目のマスタ
export type TaxType = '10' | '8' | 'exempt' | 'none'

export type Expense = {
  id: number
  date: string | null
  account: string | null
  amount: number | string | null
  taxType: TaxType
  people: number | null
  memo: string
  receipt: boolean
}

export type Account = { value: string; label: string; kana: string; defaultTax: TaxType }

export const ACCOUNTS: readonly Account[] = [
  { value: 'travel', label: '旅費交通費', kana: 'りょひこうつうひ', defaultTax: '10' },
  { value: 'meeting', label: '会議費', kana: 'かいぎひ', defaultTax: '10' },
  { value: 'entertainment', label: '接待交際費', kana: 'せったいこうさいひ', defaultTax: '10' },
  { value: 'supplies', label: '消耗品費', kana: 'しょうもうひんひ', defaultTax: '10' },
  { value: 'communication', label: '通信費', kana: 'つうしんひ', defaultTax: '10' },
  { value: 'books', label: '新聞図書費', kana: 'しんぶんとしょひ', defaultTax: '8' },
  { value: 'postage', label: '荷造運賃', kana: 'にづくりうんちん', defaultTax: '10' },
  { value: 'welfare', label: '福利厚生費', kana: 'ふくりこうせいひ', defaultTax: '10' },
  { value: 'fees', label: '支払手数料', kana: 'しはらいてすうりょう', defaultTax: 'exempt' },
  { value: 'misc', label: '雑費', kana: 'ざっぴ', defaultTax: '10' },
]

export const ACCOUNT_BY_VALUE = new Map(ACCOUNTS.map((a) => [a.value, a]))
export const ACCOUNT_BY_LABEL = new Map(ACCOUNTS.map((a) => [a.label, a]))

export const TAX_OPTIONS = [
  { value: '10', label: '課税 10%' },
  { value: '8', label: '軽減 8%' },
  { value: 'exempt', label: '非課税' },
  { value: 'none', label: '不課税' },
] as const

export function taxOf(row: Expense | undefined): number | null {
  if (!row) return null
  const amount = typeof row.amount === 'number' ? row.amount : Number.NaN
  if (!Number.isFinite(amount)) return null
  if (row.taxType === '10') return Math.floor((amount * 10) / 110)
  if (row.taxType === '8') return Math.floor((amount * 8) / 108)
  return 0
}

let nextId = 100
export function newExpense(): Expense {
  nextId += 1
  return { id: nextId, date: null, account: null, amount: null, taxType: '10', people: null, memo: '', receipt: false }
}

export function initialExpenses(): Expense[] {
  return [
    { id: 1, date: '2026-11-04', account: 'travel', amount: 1240, taxType: '10', people: null, memo: '品川→横浜 往復(顧客訪問)', receipt: false },
    { id: 2, date: '2026-11-05', account: 'meeting', amount: 3300, taxType: '10', people: 3, memo: '打合せ時の飲み物', receipt: true },
    { id: 3, date: '2026-11-07', account: 'books', amount: 2970, taxType: '8', people: null, memo: '技術書「データベース実践入門」', receipt: true },
    { id: 4, date: '2026-11-10', account: 'entertainment', amount: 18700, taxType: '10', people: 4, memo: '〇〇商事様 会食\n参加: 山田・佐藤・先方 2 名', receipt: true },
    { id: 5, date: '2026-11-12', account: 'supplies', amount: 880, taxType: '10', people: null, memo: 'USB ケーブル', receipt: true },
    { id: 6, date: '2026-11-13', account: 'fees', amount: 440, taxType: 'exempt', people: null, memo: '振込手数料', receipt: false },
  ]
}
