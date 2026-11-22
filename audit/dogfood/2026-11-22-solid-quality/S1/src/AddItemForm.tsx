import { createSignal } from 'solid-js'
import { CATEGORY_OPTIONS, type Category, type Item } from './data'

// グリッドの上の「品目を追加」フォーム
export function AddItemForm(props: { onAdd: (partial: Partial<Item>) => void }) {
  const [name, setName] = createSignal('')
  const [category, setCategory] = createSignal<Category>('stationery')
  const [qty, setQty] = createSignal('1')
  return (
    <form
      class="flex flex-wrap items-end gap-2 rounded border border-slate-200 p-2 dark:border-slate-700"
      data-testid="add-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name().trim() === '') return
        props.onAdd({ name: name().trim(), category: category(), qty: Number(qty()) || 0 })
        setName('')
      }}
    >
      <label class="flex flex-col text-xs">
        品名
        <input
          id="add-name"
          class="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <label class="flex flex-col text-xs">
        区分
        <select
          id="add-category"
          class="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={category()}
          onChange={(e) => setCategory(e.currentTarget.value as Category)}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label class="flex flex-col text-xs">
        数量
        <input
          id="add-qty"
          type="number"
          class="w-20 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={qty()}
          onInput={(e) => setQty(e.currentTarget.value)}
        />
      </label>
      <button id="add-submit" class="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700" type="submit">
        品目を追加
      </button>
    </form>
  )
}
