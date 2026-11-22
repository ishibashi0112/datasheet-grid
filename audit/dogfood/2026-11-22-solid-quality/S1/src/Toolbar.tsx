import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import type { Item } from './data'

const btn =
  'rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800'

export function Toolbar(props: {
  grid: () => SpreadsheetGridHandle<Item> | undefined
  canUndo: boolean
  canRedo: boolean
  imeDirect: boolean
  onToggleIme: () => void
  onDeleteSelected: () => void
}) {
  return (
    <div class="flex flex-wrap items-center gap-1" data-testid="toolbar">
      <button id="btn-undo" class={btn} disabled={!props.canUndo} onClick={() => props.grid()?.undo()}>
        元に戻す
      </button>
      <button id="btn-redo" class={btn} disabled={!props.canRedo} onClick={() => props.grid()?.redo()}>
        やり直し
      </button>
      <button id="btn-delete-selected" class={btn} onClick={() => props.onDeleteSelected()}>
        選択した行を削除
      </button>
      <button
        id="btn-csv"
        class={btn}
        onClick={() => props.grid()?.downloadCsv('inventory.csv', { includeTotalRow: true, escapeFormulas: true })}
      >
        CSV
      </button>
      <button
        id="btn-save-state"
        class={btn}
        onClick={() => localStorage.setItem('s1-grid-state', JSON.stringify(props.grid()?.getState()))}
      >
        状態を保存
      </button>
      <button
        id="btn-restore-state"
        class={btn}
        onClick={() => {
          const saved = localStorage.getItem('s1-grid-state')
          if (saved) props.grid()?.applyState(JSON.parse(saved))
        }}
      >
        状態を復元
      </button>
      <button id="btn-scroll" class={btn} onClick={() => props.grid()?.scrollToRow(999, { align: 'center' })}>
        1000 行目へ
      </button>
      <button id="btn-focus" class={btn} onClick={() => props.grid()?.focus()}>
        グリッドへフォーカス
      </button>
      <button id="btn-edit" class={btn} onClick={() => props.grid()?.startEditing()}>
        編集開始
      </button>
      <button id="btn-ime" class={btn} onClick={() => props.onToggleIme()}>
        IME 直接入力: {props.imeDirect ? 'オン' : 'オフ'}
      </button>
      <button
        id="btn-dark"
        class={btn}
        onClick={() => document.documentElement.classList.toggle('dark')}
      >
        ダーク切り替え
      </button>
    </div>
  )
}
