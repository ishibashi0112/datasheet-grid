import { useState } from 'react';
import { Badge, Select } from '@mantine/core';
import { numberFormatter, type CellEditorContext, type GridColumn } from '@ishibashi0112/spreadsheet-grid/lite';
import {
  CATEGORIES,
  MAKERS,
  SUPPLIERS,
  isValidJan,
  makerLabel,
  supplierLabel,
  type ProductRow,
  type Row,
} from './data';

const yen = numberFormatter();

const STATUS_OPTIONS = [
  { label: '販売中', value: 'active' },
  { label: '販売停止', value: 'paused' },
  { label: '準備中', value: 'draft' },
];
const statusLabel: Record<string, string> = { active: '販売中', paused: '販売停止', draft: '準備中' };
const statusColor: Record<string, string> = { active: 'teal', paused: 'red', draft: 'gray' };

// 仕入先: Mantine の Select(ドロップダウンはポータル)を使った custom エディタ
export function SupplierEditor({ ctx }: { ctx: CellEditorContext<Row> }) {
  const [value, setValue] = useState<string | null>((ctx.value as string | null) ?? null);
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: 'var(--ssg-cell-bg)' }}>
      <Select
        autoFocus
        data={SUPPLIERS}
        value={value}
        searchable
        defaultSearchValue={ctx.initialText ?? undefined}
        defaultDropdownOpened
        size="xs"
        placeholder="仕入先を選択"
        nothingFoundMessage="該当なし"
        onChange={(v) => {
          setValue(v);
          ctx.commit(v, 'down');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') ctx.cancel();
          if (e.key === 'Tab') {
            e.preventDefault();
            ctx.commit(value, e.shiftKey ? 'left' : 'right');
          }
        }}
        // フォーカスが外れたら(別のセルを押した等)今の値で確定する
        onBlur={() => ctx.commit(value)}
        styles={{ wrapper: { height: '100%' }, input: { height: '100%', minHeight: 0 } }}
        data-testid="supplier-editor"
        data-initial-text={String(ctx.initialText)}
      />
    </div>
  );
}

const asProduct = (row: Row | undefined): ProductRow | undefined => (row && row.kind === 'product' ? row : undefined);

export const productColumns: GridColumn<Row>[] = [
  {
    key: 'image',
    title: '画像',
    width: 56,
    pinned: 'left',
    editable: false,
    suppressAutoSize: true,
    resizable: false,
    renderCell: ({ value, row }) =>
      value ? (
        <img
          src={String(value)}
          alt={asProduct(row)?.name ?? ''}
          width={28}
          height={28}
          loading="lazy"
          style={{ display: 'block', margin: '0 auto', borderRadius: 4 }}
        />
      ) : null,
  },
  { key: 'id', title: '商品コード', width: 110, pinned: 'left', editable: false, filterType: 'text' },
  {
    key: 'name',
    title: '商品名',
    width: 240,
    filterType: 'text',
    validate: ({ value }) => String(value ?? '').trim() !== '' || '商品名は必須です',
    validationMode: 'reject',
  },
  {
    key: 'jan',
    title: 'JAN',
    width: 140,
    filterType: 'text',
    validate: ({ value }) => isValidJan(String(value ?? '')) || 'JAN コードは 13 桁(チェックデジット付き)で入力してください',
  },
  {
    key: 'maker',
    title: 'メーカー',
    width: 190,
    editor: { type: 'select', options: MAKERS },
    valueFormatter: ({ value }) => makerLabel.get(String(value)) ?? String(value ?? ''),
    filterType: 'set',
    filterOptions: MAKERS,
    // コピーは表示名で(Excel に貼るため)。貼り付けは表示名でもコードでも受ける
    formatClipboardValue: (value) => makerLabel.get(String(value)) ?? String(value ?? ''),
    parseClipboardValue: (raw) => MAKERS.find((m) => m.label === raw.trim())?.value ?? raw.trim(),
    validate: ({ value }) => makerLabel.has(String(value)) || 'メーカーが一覧にありません',
  },
  {
    key: 'supplier',
    title: '仕入先',
    width: 170,
    valueFormatter: ({ value }) => (value == null ? '' : supplierLabel.get(String(value)) ?? String(value)),
    editor: { type: 'custom', render: (ctx) => <SupplierEditor ctx={ctx} /> },
    filterType: 'set',
    filterOptions: SUPPLIERS,
  },
  {
    key: 'price',
    title: '売価',
    width: 100,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    valueFormatter: yen,
    filterType: 'number',
  },
  {
    key: 'cost',
    title: '原価',
    width: 100,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    valueFormatter: yen,
    filterType: 'number',
    validate: ({ value, row }) => {
      const p = asProduct(row);
      if (!p || value == null || p.price == null) return true;
      return Number(value) <= p.price || '原価が売価を超えています';
    },
  },
  {
    key: 'margin',
    title: '粗利率',
    width: 90,
    align: 'right',
    editable: false,
    getValue: (row) => {
      const p = asProduct(row);
      if (!p || !p.price || p.cost == null) return null;
      return Math.round(((p.price - p.cost) / p.price) * 1000) / 10;
    },
    valueFormatter: ({ value }) => (value == null ? '' : `${value}%`),
    filterType: 'number',
  },
  {
    key: 'stock',
    title: '在庫',
    width: 80,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    valueFormatter: yen,
    filterType: 'number',
  },
  {
    key: 'status',
    title: '状態',
    width: 110,
    editor: { type: 'select', options: STATUS_OPTIONS },
    valueFormatter: ({ value }) => statusLabel[String(value)] ?? String(value ?? ''),
    renderCell: ({ value }) => (
      <Badge size="sm" variant="light" color={statusColor[String(value)] ?? 'gray'}>
        {statusLabel[String(value)] ?? String(value ?? '')}
      </Badge>
    ),
    filterType: 'set',
    filterOptions: STATUS_OPTIONS,
    formatClipboardValue: (value) => statusLabel[String(value)] ?? String(value ?? ''),
    parseClipboardValue: (raw) => STATUS_OPTIONS.find((o) => o.label === raw.trim())?.value ?? raw.trim(),
  },
  { key: 'releaseDate', title: '発売日', width: 130, editor: { type: 'date' }, filterType: 'dateSet' },
  {
    key: 'taxRate',
    title: '税率',
    width: 80,
    align: 'right',
    editor: {
      type: 'select',
      options: [
        { label: '8%', value: '8' },
        { label: '10%', value: '10' },
      ],
    },
    valueFormatter: ({ value }) => (value == null ? '' : `${value}%`),
    parseClipboardValue: (raw) => {
      const n = Number(raw.replace('%', '').trim());
      return Number.isFinite(n) ? n : raw;
    },
    filterType: 'set',
  },
  { key: 'discontinued', title: '廃番', width: 70, editor: { type: 'checkbox' } },
  { key: 'note', title: '備考', width: 200, filterType: 'text' },
];

export const categoryName = (code: string) => CATEGORIES.find((c) => c.code === code)?.name ?? code;
