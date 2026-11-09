import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import { PRODUCTS, REGIONS, STATUSES, type Lang, type Sale } from './data';

const yen = numberFormatter();

const T = {
  ja: { date: '日付', region: '地域', rep: '担当', product: '商品', qty: '数量', amount: '金額', status: '状態', customer: '顧客', memo: 'メモ' },
  en: { date: 'Date', region: 'Region', rep: 'Rep', product: 'Product', qty: 'Qty', amount: 'Amount', status: 'Status', customer: 'Customer', memo: 'Memo' },
} as const;

export const createColumns = (lang: Lang, opts: { groupByRegion: boolean }): GridColumn<Sale>[] => {
  const t = T[lang];
  const regionOptions = REGIONS.map((r) => ({ value: r.value, label: r[lang] }));
  const productOptions = PRODUCTS.map((p) => ({ value: p.value, label: p[lang] }));
  const statusOptions = STATUSES.map((s) => ({ value: s.value, label: s[lang] }));
  const label = (options: { value: string; label: string }[]) => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return ({ value }: { value: unknown }) => (value == null || value === '' ? '' : (map.get(String(value)) ?? String(value)));
  };
  return [
    { key: 'date', title: t.date, width: 120, filterType: 'dateSet', editor: { type: 'date' } },
    {
      key: 'region',
      title: t.region,
      width: 100,
      filterType: 'set',
      filterOptions: regionOptions,
      editor: { type: 'select', options: regionOptions },
      valueFormatter: label(regionOptions),
      rowGroup: opts.groupByRegion,
    },
    { key: 'rep', title: t.rep, width: 120, filterType: 'textSet' },
    {
      key: 'product',
      title: t.product,
      width: 140,
      filterType: 'set',
      filterOptions: productOptions,
      editor: { type: 'select', options: productOptions },
      valueFormatter: label(productOptions),
    },
    { key: 'qty', title: t.qty, width: 100, align: 'right', filterType: 'number', editor: { type: 'number', min: 0, integer: true }, aggFunc: 'sum' },
    { key: 'amount', title: t.amount, width: 150, align: 'right', filterType: 'numberSet', editor: { type: 'number', min: 0 }, valueFormatter: yen, aggFunc: 'sum' },
    {
      key: 'status',
      title: t.status,
      width: 110,
      filterType: 'select',
      filterOptions: statusOptions,
      editor: { type: 'select', options: statusOptions },
      valueFormatter: label(statusOptions),
      conditionalFormat: { chips: { paid: 'good', unpaid: 'warning', cancelled: 'neutral' } },
    },
    { key: 'customer', title: t.customer, width: 100, filterType: 'text' },
    // メモは filterType を付けない(絞り込めない列)
    { key: 'memo', title: t.memo, width: 160 },
  ];
};
