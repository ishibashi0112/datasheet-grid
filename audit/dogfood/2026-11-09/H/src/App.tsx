import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Select,
  Text,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import {
  SpreadsheetGrid,
  restoreColumnsFromState,
  type GridColumn,
  type GridRowKey,
  type GridState,
  type RowSelectionModel,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid'
import { defaultColumns } from './columns'
import { generateTasks, STATUSES, type Status, type Subtask, type Task } from './data'
import { SubtaskGrid } from './SubtaskGrid'

const STATE_KEY = 'wbs-grid-state'
const GROUP_KEY = 'wbs-grid-grouping'
const EXPANDED_KEY = 'wbs-grid-expanded'

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

// グループ化の設定(GridState には入らないので別に保存する)。
const debugFlags = new URLSearchParams(location.search)

function applyGrouping(columns: GridColumn<Task>[], groupKeys: string[] | undefined) {
  if (debugFlags.has('nogroup')) groupKeys = []
  if (debugFlags.has('nocf')) columns = columns.map((c) => ({ ...c, conditionalFormat: undefined }))
  if (!groupKeys) return columns
  return columns.map((c) =>
    c.rowGroup === undefined ? c : { ...c, rowGroup: groupKeys.includes(c.key) },
  )
}

export function App() {
  const scheme = useComputedColorScheme('light')
  const { toggleColorScheme } = useMantineColorScheme()
  const gridRef = useRef<SpreadsheetGridHandle<Task>>(null)
  // 調査用: コンソールからハンドルを触る
  ;(window as unknown as { __grid: typeof gridRef }).__grid = gridRef
  const [rows, setRows] = useState<Task[]>(() => generateTasks(3000))
  const [initialState] = useState<GridState | undefined>(() => readJson<GridState>(STATE_KEY))
  const [columns, setColumns] = useState<GridColumn<Task>[]>(() =>
    applyGrouping(restoreColumnsFromState(defaultColumns, initialState), readJson<string[]>(GROUP_KEY)),
  )
  const [selection, setSelection] = useState<RowSelectionModel>({ type: 'include', rowKeys: [] })
  const [selectedCount, setSelectedCount] = useState(0)
  const [bulkStatus, setBulkStatus] = useState<Status | null>('完了')
  const [expandedCount, setExpandedCount] = useState(0)
  const [lastExport, setLastExport] = useState('')

  const groupKeys = useMemo(() => columns.filter((c) => c.rowGroup).map((c) => c.key), [columns])
  const groupLabel = groupKeys
    .map((k) => columns.find((c) => c.key === k)?.title ?? k)
    .join(' → ')

  const handleColumnsChange = useCallback((next: GridColumn<Task>[]) => {
    setColumns(next)
    localStorage.setItem(GROUP_KEY, JSON.stringify(next.filter((c) => c.rowGroup).map((c) => c.key)))
  }, [])

  // 展開行の開閉を戻す。
  useEffect(() => {
    const keys = readJson<GridRowKey[]>(EXPANDED_KEY)
    if (!keys) return
    for (const k of keys) gridRef.current?.setDetailRowExpanded(k, true)
  }, [])

  const updateSubtasks = useCallback((taskId: string, subtasks: Subtask[]) => {
    setRows((prev) => prev.map((t) => (t.id === taskId ? { ...t, subtasks } : t)))
  }, [])

  const applyBulkStatus = () => {
    const grid = gridRef.current
    if (!grid || !bulkStatus) return
    const keys = new Set(grid.getSelectedRowKeys())
    const next = rows.map((t) =>
      keys.has(t.id)
        ? { ...t, status: bulkStatus, progress: bulkStatus === '完了' ? 100 : t.progress }
        : t,
    )
    grid.applyRows(next)
  }

  const deleteSelected = () => {
    const grid = gridRef.current
    if (!grid) return
    const keys = new Set(grid.getSelectedRowKeys())
    grid.applyRows(rows.filter((t) => !keys.has(t.id)))
    grid.clearRowSelection()
  }

  const addTask = () => {
    const maxNo = rows.reduce((m, t) => Math.max(m, Number(t.id.slice(2))), 0)
    const task: Task = {
      id: `T-${String(maxNo + 1).padStart(5, '0')}`,
      wbs: '',
      title: '',
      phase: '実装',
      assignee: '佐藤 健',
      status: '未着手',
      priority: '中',
      start: '2026-11-09',
      due: '2026-11-16',
      estimate: null,
      progress: 0,
      note: '',
      subtasks: [],
    }
    flushSync(() => setRows((prev) => [...prev, task]))
    const grid = gridRef.current
    const viewRowIndex = grid?.getViewRowIndex(task.id) ?? -1
    const colIndex = grid?.getColIndex('title') ?? -1
    if (viewRowIndex >= 0 && colIndex >= 0) grid?.startEditing(viewRowIndex, colIndex)
    else setLastExport(`追加した ${task.id} は今の表示に出ていません(折りたたみ / フィルター)`)
  }

  const exportCsv = () => {
    const csv = gridRef.current?.exportCsv({ includeGroupRows: true }) ?? ''
    ;(window as unknown as { __lastCsv: string }).__lastCsv = csv
    setLastExport(`CSV ${csv.split('\r\n').length - 1} 行を出力しました`)
  }

  const resetLayout = () => {
    localStorage.removeItem(STATE_KEY)
    localStorage.removeItem(GROUP_KEY)
    localStorage.removeItem(EXPANDED_KEY)
    location.reload()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 12, boxSizing: 'border-box', gap: 8 }}>
      <Group justify="space-between">
        <Group gap="sm">
          <Title order={3}>WBS タスク管理</Title>
          <Badge variant="light">{rows.length.toLocaleString()} 件</Badge>
          <Badge variant="outline" data-testid="grouping">
            グループ: {groupLabel || 'なし'}
          </Badge>
        </Group>
        <Group gap="xs">
          <Tooltip label="ライト / ダーク">
            <ActionIcon variant="default" onClick={toggleColorScheme} aria-label="配色の切り替え" data-testid="scheme">
              {scheme === 'dark' ? '☾' : '☀'}
            </ActionIcon>
          </Tooltip>
          <Button size="xs" variant="default" onClick={resetLayout}>
            表示をリセット
          </Button>
        </Group>
      </Group>
      <Group gap="xs" data-testid="toolbar">
        <Button size="xs" variant="default" onClick={() => gridRef.current?.expandAllGroups()}>
          すべて開く
        </Button>
        <Button size="xs" variant="default" onClick={() => gridRef.current?.collapseAllGroups()}>
          すべて閉じる
        </Button>
        <Button size="xs" variant="default" onClick={() => gridRef.current?.collapseAllDetailRows()}>
          サブタスクをすべて閉じる({expandedCount})
        </Button>
        <Text size="sm" c="dimmed" ml="md">
          選択 {selectedCount} 件
        </Text>
        <Select
          size="xs"
          w={130}
          data={STATUSES}
          value={bulkStatus}
          onChange={(v) => setBulkStatus(v as Status | null)}
          aria-label="一括で変える状態"
        />
        <Button size="xs" onClick={applyBulkStatus} disabled={selectedCount === 0}>
          状態を一括変更
        </Button>
        <Button size="xs" color="red" variant="light" onClick={deleteSelected} disabled={selectedCount === 0}>
          選択を削除
        </Button>
        <Button size="xs" variant="light" onClick={addTask} ml="md">
          タスクを追加
        </Button>
        <Button size="xs" variant="default" onClick={exportCsv}>
          CSV(小計つき)
        </Button>
        <Button size="xs" variant="default" onClick={() => gridRef.current?.undo()}>
          元に戻す
        </Button>
        <Text size="xs" c="dimmed" data-testid="status">
          {lastExport}
        </Text>
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SpreadsheetGrid<Task>
          ref={gridRef}
          ariaLabel="タスク一覧"
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          onColumnsChange={handleColumnsChange}
          rowKeyGetter={(row) => row.id}
          height="100%"
          theme={scheme}
          initialState={initialState}
          onStateChange={(state) => localStorage.setItem(STATE_KEY, JSON.stringify(state))}
          enableRowSelection
          rowSelection={selection}
          onRowSelectionChange={(model) => {
            setSelection(model)
            // 件数は描画後にハンドルから読む
            queueMicrotask(() => setSelectedCount(gridRef.current?.getSelectedRowCount() ?? 0))
          }}
          columnDragMotion="live"
          detailRow={{
            height: 240,
            isExpandable: () => true,
            render: ({ row, collapse }) => (
              <SubtaskGrid task={row} theme={scheme} onChange={updateSubtasks} onClose={collapse} />
            ),
          }}
          onExpandedDetailRowKeysChange={(keys) => {
            setExpandedCount(keys.length)
            localStorage.setItem(EXPANDED_KEY, JSON.stringify(keys))
          }}
          totalRow={debugFlags.has('nototal') ? undefined : { label: '全体' }}
          animateRows={!debugFlags.has('noanim')}
          find
          showFilterChipBar
          enableContextMenu
          getContextMenuItems={({ target }) => {
            const row = target.row
            if (!row) return []
            return [
              {
                label: 'サブタスクを開く',
                onSelect: () => gridRef.current?.setDetailRowExpanded(target.rowKey, true),
              },
              {
                label: '完了にする',
                onSelect: () =>
                  gridRef.current?.applyRows(
                    rows.map((t) => (t.id === row.id ? { ...t, status: '完了' as const, progress: 100 } : t)),
                  ),
              },
            ]
          }}
        />
      </div>
    </div>
  )
}
