import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import { MEMBERS, PRIORITIES, STATUSES, type Milestone, type Task } from './api'

const opts = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

export const taskColumns: GridColumn<Task>[] = [
  { key: 'title', title: 'タスク', width: 200, pinned: 'left', editable: true, filterType: 'text' },
  {
    key: 'assignee',
    title: '担当',
    width: 100,
    editable: true,
    editor: { type: 'select', options: opts(MEMBERS) },
    filterType: 'set',
  },
  { key: 'due', title: '期限', width: 130, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
  {
    key: 'priority',
    title: '優先度',
    width: 90,
    editable: true,
    editor: { type: 'select', options: opts(PRIORITIES) },
    filterType: 'set',
    conditionalFormat: { chips: { 高: 'critical', 中: 'warning', 低: 'good' } },
  },
  {
    key: 'estimate',
    title: '見積(h)',
    width: 100,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, max: 200, step: 0.5 },
    valueFormatter: numberFormatter({ maximumFractionDigits: 1 }),
    filterType: 'number',
    aggFunc: 'sum',
  },
  {
    key: 'status',
    title: '状態',
    width: 100,
    editable: true,
    editor: { type: 'select', options: opts(STATUSES) },
    filterType: 'set',
    conditionalFormat: { chips: { 未着手: 'neutral', 進行中: 'info', レビュー: 'warning', 完了: 'good' } },
  },
  { key: 'memo', title: 'メモ', width: 220, flex: 1, editable: true, editor: { type: 'text', multiline: true }, filterType: 'text' },
]

export const milestoneColumns: GridColumn<Milestone>[] = [
  { key: 'name', title: 'マイルストーン', width: 180, editable: true, filterType: 'text' },
  { key: 'dueDate', title: '期日', width: 130, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'owner', title: '責任者', width: 110, editable: true, editor: { type: 'select', options: opts(MEMBERS) }, filterType: 'set' },
  {
    key: 'progress',
    title: '進捗(%)',
    width: 120,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, max: 100, integer: true },
    filterType: 'number',
    conditionalFormat: { dataBar: {} },
  },
]
