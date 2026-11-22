import { numberFormatter, type GridColumn, type LabelRowOptions } from '@ishibashi0112/spreadsheet-grid-solid'
import { BRANDS, SUPPLIERS, SUPPLIER_BY_CODE, isLabel, thumbnailUrl, type CategoryLabel, type Row } from './data'
import { SupplierEditor } from './SupplierEditor'

const brandOptions = BRANDS.map((b) => ({ value: b, label: b }))
const SUPPLIER_BY_NAME = new Map(SUPPLIERS.map((s) => [s.name, s.code]))

export function createColumns(opts: { popupMount?: () => Element | undefined } = {}): GridColumn<Row>[] {
  return [
    {
      key: 'thumb',
      title: '画像',
      width: 56,
      editable: false,
      suppressAutoSize: true,
      renderCell: ({ row }) =>
        row.kind === 'product' ? (
          <img src={thumbnailUrl(row.hue)} alt="" width={24} height={24} class="mx-auto block rounded" loading="lazy" />
        ) : null,
    },
    { key: 'sku', title: 'SKU', width: 110, pinned: 'left', editable: false, filterType: 'text' },
    {
      key: 'name',
      title: '商品名',
      width: 200,
      filterType: 'textSet',
      validate: ({ value }) => String(value ?? '').trim() !== '' || '商品名は必須です',
      validationMode: 'reject',
    },
    {
      key: 'brand',
      title: 'ブランド',
      width: 150,
      editor: { type: 'select', options: brandOptions },
      filterType: 'set',
    },
    {
      key: 'supplier',
      title: '仕入先',
      width: 170,
      editor: { type: 'custom', render: (ctx) => <SupplierEditor ctx={ctx} mount={opts.popupMount} /> },
      valueFormatter: ({ value }) => SUPPLIER_BY_CODE.get(String(value ?? ''))?.name ?? String(value ?? ''),
      formatClipboardValue: (value) => SUPPLIER_BY_CODE.get(String(value ?? ''))?.name ?? String(value ?? ''),
      parseClipboardValue: (raw) => SUPPLIER_BY_NAME.get(raw.trim()) ?? raw.trim(),
      validate: ({ value }) => SUPPLIER_BY_CODE.has(String(value ?? '')) || '登録されていない仕入先です',
      filterType: 'set',
    },
    {
      key: 'price',
      title: '価格',
      width: 100,
      align: 'right',
      editor: { type: 'number', min: 0, integer: true },
      valueFormatter: numberFormatter({ maximumFractionDigits: 0 }),
      filterType: 'number',
      aggFunc: 'avg',
    },
    {
      key: 'stock',
      title: '在庫',
      width: 90,
      align: 'right',
      editor: { type: 'number', min: 0, max: 9999, integer: true },
      filterType: 'numberSet',
      aggFunc: 'sum',
    },
    { key: 'releasedAt', title: '発売日', width: 130, editor: { type: 'date' }, filterType: 'dateSet' },
    { key: 'published', title: '公開', width: 70, editor: { type: 'checkbox' }, filterType: 'set' },
    {
      key: 'jan',
      title: 'JAN',
      width: 150,
      filterType: 'text',
      validate: ({ value }) => /^\d{13}$/.test(String(value ?? '')) || 'JAN は 13 桁の数字です',
    },
  ]
}

export const labelRow: LabelRowOptions<Row, CategoryLabel> = {
  isLabelRow: isLabel,
  getLabel: (row) => row.category,
  sticky: true,
  height: 32,
  render: (ctx) => (
    <span class="flex items-center gap-2">
      <span class="rounded bg-primary px-1.5 text-xs text-primary-foreground">カテゴリ</span>
      <strong>{ctx.label}</strong>
      <span class="text-xs text-muted-foreground">{ctx.sectionRowCount} 件</span>
    </span>
  ),
}
