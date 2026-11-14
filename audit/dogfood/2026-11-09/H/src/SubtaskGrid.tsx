import { useMemo } from 'react'
import { Button, Group, Text } from '@mantine/core'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import { ASSIGNEES, type Subtask, type Task } from './data'

type Props = {
  task: Task
  theme: 'light' | 'dark'
  onChange: (taskId: string, subtasks: Subtask[]) => void
  onClose: () => void
}

const subColumns: GridColumn<Subtask>[] = [
  { key: 'id', title: 'No.', width: 110, editable: false },
  { key: 'title', title: 'サブタスク', width: 200, flex: 1 },
  {
    key: 'owner',
    title: '担当',
    width: 120,
    editor: { type: 'select', options: ASSIGNEES.map((a) => ({ value: a, label: a })) },
  },
  {
    key: 'hours',
    title: '工数(h)',
    width: 90,
    align: 'right',
    editor: { type: 'number', min: 0, step: 0.5 },
  },
  { key: 'done', title: '完了', width: 70, align: 'center', editor: { type: 'checkbox' } },
]

export function SubtaskGrid({ task, theme, onChange, onClose }: Props) {
  const doneCount = useMemo(() => task.subtasks.filter((s) => s.done).length, [task.subtasks])
  const addSubtask = () => {
    const next: Subtask = {
      id: `${task.id}-${task.subtasks.length + 1}`,
      title: '',
      owner: task.assignee,
      hours: null,
      done: false,
    }
    onChange(task.id, [...task.subtasks, next])
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', padding: 8, boxSizing: 'border-box' }}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>
          {task.id} {task.title} のサブタスク({doneCount} / {task.subtasks.length} 完了)
        </Text>
        <Group gap="xs">
          <Button size="compact-xs" variant="light" onClick={addSubtask}>
            サブタスクを追加
          </Button>
          <Button size="compact-xs" variant="subtle" onClick={onClose}>
            閉じる
          </Button>
        </Group>
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SpreadsheetGrid<Subtask>
          ariaLabel={`${task.id} のサブタスク`}
          rows={task.subtasks}
          columns={subColumns}
          onRowsChange={(next) => onChange(task.id, next)}
          rowKeyGetter={(row) => row.id}
          height="100%"
          density="compact"
          theme={theme}
          showTopBar={false}
          noRowsText="サブタスクはありません"
        />
      </div>
    </div>
  )
}
