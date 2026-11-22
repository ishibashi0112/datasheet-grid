export type Row = { id: number; name: string; qty: number }
export const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `n${i}`, qty: i }))
export const columns = [
  { key: 'name', title: 'Name', width: 120, filterType: 'text' as const },
  { key: 'qty', title: 'Qty', width: 80, editor: { type: 'number' as const } },
]
