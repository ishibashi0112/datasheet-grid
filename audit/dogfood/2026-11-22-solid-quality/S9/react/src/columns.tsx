// 経費の明細の列定義
import { numberFormatter, numberParser, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import { AccountEditor } from './AccountEditor'
import { ACCOUNTS, ACCOUNT_BY_LABEL, ACCOUNT_BY_VALUE, TAX_OPTIONS, taxOf, type Expense } from './data'

const yen = numberFormatter()
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const amountOf = (row: Expense) => (typeof row.amount === 'number' ? row.amount : null)

export function createColumns(): GridColumn<Expense>[] {
  return [
    {
      key: 'date',
      title: '日付',
      width: 130,
      editable: true,
      editor: { type: 'date', strict: true },
      filterType: 'dateSet',
      validate: ({ value }) =>
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value > today()
          ? '未来の日付は入力できません'
          : true,
    },
    {
      key: 'account',
      title: '科目',
      width: 130,
      editable: true,
      editor: { type: 'custom', imeDirectInput: true, render: (ctx) => <AccountEditor ctx={ctx} /> },
      valueFormatter: ({ value }) => ACCOUNT_BY_VALUE.get(String(value ?? ''))?.label ?? String(value ?? ''),
      // コピー / CSV は科目名、貼り付けは科目名でもコードでも読む
      formatClipboardValue: (value) => ACCOUNT_BY_VALUE.get(String(value ?? ''))?.label ?? String(value ?? ''),
      parseClipboardValue: (raw) => {
        const text = raw.trim()
        if (text === '') return null
        return ACCOUNT_BY_LABEL.get(text)?.value ?? (ACCOUNT_BY_VALUE.has(text) ? text : text)
      },
      filterType: 'set',
      filterOptions: ACCOUNTS.map((a) => ({ value: a.value, label: a.label })),
      validate: ({ value, row }) => {
        if (value == null || value === '') return amountOf(row) !== null ? '科目を選んでください' : true
        return ACCOUNT_BY_VALUE.has(String(value)) || '科目がマスタにありません'
      },
    },
    {
      key: 'amount',
      title: '金額(税込)',
      width: 120,
      align: 'right',
      editable: true,
      editor: { type: 'number', min: 1, max: 1_000_000, integer: true },
      parseClipboardValue: numberParser({ strip: ['¥', '￥', '円'], negativeParentheses: true }),
      valueFormatter: yen,
      aggFunc: 'sum',
      filterType: 'number',
      validate: ({ value, row }) =>
        typeof value === 'number' && value >= 30_000 && !row.receipt ? '3 万円以上は領収書が必要です' : true,
    },
    {
      key: 'taxType',
      title: '税区分',
      width: 100,
      editable: true,
      editor: { type: 'select', options: TAX_OPTIONS.map((o) => ({ value: o.value, label: o.label })), clipboard: 'label' },
      valueFormatter: ({ value }) => TAX_OPTIONS.find((o) => o.value === value)?.label ?? String(value ?? ''),
      filterType: 'set',
      filterOptions: TAX_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      key: 'tax',
      title: '消費税',
      width: 90,
      align: 'right',
      editable: false,
      getValue: (row) => taxOf(row),
      valueFormatter: yen,
      aggFunc: 'sum',
    },
    {
      key: 'people',
      title: '人数',
      width: 70,
      align: 'right',
      editable: true,
      editor: { type: 'number', min: 1, max: 50, integer: true },
      validationMode: 'reject',
      validate: ({ value, row }) =>
        (value == null || value === '') && (row.account === 'meeting' || row.account === 'entertainment')
          ? '会議費・接待交際費は人数が必要です'
          : true,
    },
    {
      key: 'memo',
      title: '摘要',
      width: 260,
      flex: 1,
      minWidth: 200,
      editable: true,
      editor: { type: 'text', multiline: true },
      autoHeight: true,
      validate: ({ value, row }) =>
        (amountOf(row) ?? 0) >= 5000 && String(value ?? '').trim() === '' ? '5,000 円以上は摘要を入力してください' : true,
      filterType: 'text',
    },
    {
      key: 'receipt',
      title: '領収書',
      width: 80,
      align: 'center',
      editable: true,
      editor: { type: 'checkbox' },
    },
  ]
}
