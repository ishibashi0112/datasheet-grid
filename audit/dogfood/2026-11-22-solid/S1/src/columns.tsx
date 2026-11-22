import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import { CATEGORY_OPTIONS, STATUS_OPTIONS, type Item } from './data'

const num = numberFormatter({ maximumFractionDigits: 0 })
const yen: typeof num = (p) => (p.value === null || p.value === undefined || p.value === '' ? '' : `¥${num(p)}`)
const categoryLabel = (v: unknown) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? '')
const statusLabel = (v: unknown) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? String(v ?? '')

export type ColumnActions = {
  onDelete: (id: number) => void
  log: (msg: string) => void
}

export function buildColumns(actions: ColumnActions): GridColumn<Item>[] {
  return [
    { key: 'code', title: '品番', width: 100, pinned: 'left', editable: false, filterType: 'text' },
    {
      key: 'name',
      title: '品名',
      width: 150,
      editable: true,
      filterType: 'text',
      validate: ({ value }) => (String(value ?? '').trim() === '' ? '品名は必須です' : true),
    },
    {
      key: 'category',
      title: '区分',
      width: 100,
      editor: { type: 'select', options: [...CATEGORY_OPTIONS], clipboard: 'label' },
      valueFormatter: ({ value }) => categoryLabel(value),
      filterType: 'set',
      filterOptions: [...CATEGORY_OPTIONS],
    },
    {
      key: 'qty',
      title: '数量',
      width: 90,
      align: 'right',
      editor: { type: 'number', min: 0, max: 99999, integer: true },
      valueFormatter: numberFormatter(),
      filterType: 'number',
      aggFunc: 'sum',
    },
    {
      key: 'price',
      title: '単価',
      width: 100,
      align: 'right',
      editor: { type: 'number', min: 0, integer: true },
      validationMode: 'reject',
      validate: ({ value }) => (typeof value === 'number' && value > 1_000_000 ? '単価は 1,000,000 円以下です' : true),
      valueFormatter: yen,
      filterType: 'number',
      aggFunc: 'avg',
    },
    {
      key: 'amount',
      title: '金額',
      width: 120,
      align: 'right',
      editable: false,
      getValue: (row) => (row.qty ?? 0) * (row.price ?? 0),
      valueFormatter: yen,
      aggFunc: 'sum',
    },
    { key: 'due', title: '入荷予定日', width: 130, editor: { type: 'date' }, filterType: 'dateSet' },
    { key: 'reorder', title: '要発注', width: 80, align: 'center', editor: { type: 'checkbox' }, filterType: 'set' },
    { key: 'note', title: '備考', width: 200, editor: { type: 'text', multiline: true } },
    {
      key: 'status',
      title: '状態',
      width: 150,
      editor: { type: 'select', options: [...STATUS_OPTIONS], clipboard: 'label' },
      valueFormatter: ({ value }) => statusLabel(value),
      filterType: 'set',
      renderCell: (ctx) => (
        <div class="flex w-full items-center justify-between gap-1">
          <span class={ctx.value === 'confirmed' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>
            {statusLabel(ctx.value)}
          </span>
          <button
            type="button"
            class="rounded border border-slate-300 px-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            data-testid="toggle-status"
            onClick={() => {
              actions.log(`toggle ${ctx.rowKey}`)
              ctx.setValue(ctx.value === 'confirmed' ? 'draft' : 'confirmed')
            }}
          >
            {ctx.value === 'confirmed' ? '解除' : '確定'}
          </button>
        </div>
      ),
    },
    {
      key: 'ops',
      title: ' ',
      width: 70,
      editable: false,
      suppressAutoSize: true,
      renderCell: (ctx) => (
        <button
          type="button"
          class="rounded bg-rose-600 px-2 text-xs text-white hover:bg-rose-700"
          data-testid="delete-row"
          onClick={() => actions.onDelete(ctx.row.id)}
        >
          削除
        </button>
      ),
    },
  ]
}

export const canEditCell = (_r: number, _c: number, row: Item, column: GridColumn<Item>) =>
  row.status !== 'confirmed' || column.key === 'status'
