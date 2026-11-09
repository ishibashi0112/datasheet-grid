import type { GridContextMenuItem, GridContextMenuParams, GridRowKey } from '@ishibashi0112/spreadsheet-grid'

// 右クリックメニューの共通の項目(行の削除と値のコピー)
export function buildContextMenu<T>(
  params: GridContextMenuParams<T>,
  opts: { onDelete: (rowKey: GridRowKey) => void; onLog?: (msg: string) => void },
): GridContextMenuItem[] {
  const items: GridContextMenuItem[] = [{ kind: 'label', label: '操作' }]
  const target = params.target
  if (target.type === 'cell') {
    const value = target.value
    const title = target.column.title ?? target.column.key
    items.push({
      id: 'copy',
      label: '値をコピー',
      onSelect: () => {
        void navigator.clipboard?.writeText(String(value ?? ''))
        opts.onLog?.(`コピー: ${title} = ${String(value ?? '')}`)
      },
    })
  }
  items.push({ kind: 'separator' })
  items.push({
    id: 'delete',
    label: 'この行を削除',
    danger: true,
    onSelect: () => opts.onDelete(target.rowKey),
  })
  return items
}
