export type Result = 'ok' | 'warn' | 'ng' | ''
export type Inspection = {
  id: number
  place: string
  item: string
  result: Result
  value: number | null
  memo: string
  photo: boolean
  inspector: string
  action: string
}
const PLACES = ['第1工場 A棟', '第1工場 B棟', '第2工場', '倉庫', '事務所', '屋上', '駐車場']
const ITEMS = ['消火器の圧力', '非常灯', '配電盤の温度', '床の破損', '排水溝', '手すり', '換気扇', 'ガス漏れ検知器']
export function createInspections(n: number): Inspection[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    place: PLACES[i % PLACES.length]!,
    item: ITEMS[(i * 3) % ITEMS.length]!,
    result: (['ok', 'ok', 'warn', 'ng', ''] as const)[i % 5]!,
    value: i % 6 === 0 ? null : Math.round((20 + ((i * 37) % 60)) * 10) / 10,
    memo: i % 4 === 0 ? '再確認が必要' : '',
    photo: i % 3 === 0,
    inspector: ['佐藤', '鈴木', '高橋', '田中'][i % 4]!,
    action: '',
  }))
}
