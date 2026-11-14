import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import { ASSIGNEES, PHASES, PRIORITIES, STATUSES, type Task } from './data'

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }))

const hours = numberFormatter({ maximumFractionDigits: 1 })

export const defaultColumns: GridColumn<Task>[] = [
  {
    key: 'id',
    title: 'ID',
    width: 96,
    pinned: 'left',
    editable: false,
    aggFunc: 'count',
    filterType: 'text',
  },
  { key: 'wbs', title: 'WBS', width: 80, editable: false, filterType: 'text' },
  {
    key: 'title',
    title: 'タスク名',
    width: 240,
    filterType: 'text',
    validate: ({ value }) => (String(value ?? '').trim() === '' ? 'タスク名は必須です' : true),
  },
  {
    key: 'phase',
    title: 'フェーズ',
    width: 110,
    rowGroup: false,
    editor: { type: 'select', options: toOptions(PHASES) },
    filterType: 'set',
  },
  {
    key: 'assignee',
    title: '担当者',
    width: 120,
    rowGroup: true,
    editor: { type: 'select', options: toOptions(ASSIGNEES) },
    filterType: 'set',
  },
  {
    key: 'status',
    title: '状態',
    width: 110,
    rowGroup: true,
    editor: { type: 'select', options: toOptions(STATUSES) },
    filterType: 'set',
    conditionalFormat: {
      chips: {
        未着手: 'neutral',
        進行中: 'info',
        レビュー中: 'warning',
        完了: 'good',
        保留: 'critical',
      },
    },
  },
  {
    key: 'priority',
    title: '優先度',
    width: 90,
    rowGroup: false,
    editor: { type: 'select', options: toOptions(PRIORITIES) },
    filterType: 'set',
    conditionalFormat: { chips: { 高: 'critical', 中: 'warning', 低: 'neutral' } },
  },
  { key: 'start', title: '開始日', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  {
    key: 'due',
    title: '期限',
    width: 120,
    editor: { type: 'date' },
    filterType: 'dateSet',
    validate: ({ value, row }) =>
      value && row.start && String(value) < row.start ? '期限が開始日より前です' : true,
  },
  {
    key: 'estimate',
    title: '見積(h)',
    width: 100,
    align: 'right',
    editor: { type: 'number', min: 0, step: 0.5 },
    aggFunc: 'sum',
    valueFormatter: hours,
    filterType: 'number',
  },
  {
    key: 'progress',
    title: '進捗(%)',
    width: 120,
    align: 'right',
    editor: { type: 'number', min: 0, max: 100, integer: true },
    aggFunc: 'avg',
    valueFormatter: ({ value }) =>
      value === null || value === undefined || value === '' ? '' : `${Math.round(Number(value) * 10) / 10}%`,
    conditionalFormat: { dataBar: { min: 0, max: 100 } },
    filterType: 'number',
  },
  {
    key: 'subtaskCount',
    title: 'サブタスク',
    width: 96,
    align: 'right',
    editable: false,
    getValue: (row) => row.subtasks.length,
  },
  {
    key: 'note',
    title: 'メモ',
    width: 200,
    editor: { type: 'text', multiline: true },
    filterType: 'text',
  },
]
