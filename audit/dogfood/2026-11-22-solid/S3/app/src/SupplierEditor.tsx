// 仕入先を選ぶ custom エディタ。候補の一覧はポータルで body に出す(ドキュメントの「custom の枠」の書き方)。
import { createMemo, createSignal, For, onSettled, Show } from 'solid-js'
import { Portal } from '@solidjs/web'
import type { CellEditorContext } from '@ishibashi0112/spreadsheet-grid-solid'
import { SUPPLIERS, SUPPLIER_BY_CODE, type Row } from './data'

const params = new URLSearchParams(location.search)

export function SupplierEditor(props: { ctx: CellEditorContext<Row>; mount?: () => Element | undefined }) {
  let root!: HTMLDivElement
  let input!: HTMLInputElement
  let list: HTMLUListElement | undefined
  // 英字キーで打ち始めたときはその文字、そうでなければ今の仕入先の名前
  // ダブルクリック / Enter / F2 では initialText に今の値(コード)が入るので、そのときは空から始める
  const [query, setQuery] = createSignal(() =>
    props.ctx.initialText === String(props.ctx.value ?? '') ? '' : props.ctx.initialText,
  )
  const [active, setActive] = createSignal(0)
  const [pos, setPos] = createSignal<{ left: number; top: number; width: number } | null>(null)

  const currentName = () => SUPPLIER_BY_CODE.get(String(props.ctx.value ?? ''))?.name ?? ''
  const candidates = createMemo(() => {
    const q = query().trim()
    const all = q === '' ? SUPPLIERS : SUPPLIERS.filter((s) => s.name.includes(q) || s.code.includes(q.toUpperCase()))
    return all.slice(0, 50)
  })

  const choose = (code: string | undefined, direction?: 'down' | 'up' | 'right' | 'left') => {
    if (code === undefined) return
    const result = props.ctx.commit(code, direction)
    if (import.meta.env.DEV) (window as any).__lastCommit = result
  }

  onSettled(() => {
    input.focus()
    input.select()
    let raf2 = 0
    let watching = false
    const measure = () => {
      const r = root.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 2, width: Math.max(260, r.width) })
    }
    const onScroll = (event: Event) => {
      if (!watching) return
      if (event.target === document || (event.target instanceof Node && event.target.contains(root))) props.ctx.cancel()
    }
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        measure()
        watching = true
      })
    })
    window.addEventListener('scroll', onScroll, true)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.removeEventListener('scroll', onScroll, true)
    }
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return
    const n = candidates().length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(n - 1, i + 1))
      list?.children[Math.min(n - 1, active() + 1)]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
      list?.children[Math.max(0, active() - 1)]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(candidates()[active()]?.code, 'down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      choose(candidates()[active()]?.code, e.shiftKey ? 'left' : 'right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.ctx.cancel()
    }
  }

  return (
    <div
      ref={root}
      class="box-border flex h-full w-full items-center bg-background px-1"
      data-testid="supplier-editor"
    >
      <input
        ref={input}
        class="h-full w-full bg-transparent px-1 text-sm outline-none"
        placeholder={currentName() || '仕入先を検索'}
        value={query()}
        onInput={(e) => {
          setQuery(e.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        // フォーカスが外れたら取り消す(select エディタと同じく「選ぶ = 確定」)
        onBlur={() => props.ctx.cancel()}
        aria-label="仕入先"
        aria-controls="supplier-listbox"
        aria-activedescendant={`supplier-opt-${active()}`}
        role="combobox"
        aria-expanded="true"
      />
      <Show when={pos()}>
        {(p) => (
          <Portal mount={props.mount?.() ?? (params.has("bodyportal") ? document.body : root.closest("dialog") ?? document.body)}>
            <ul
              ref={(el) => (list = el)}
              id="supplier-listbox"
              role="listbox"
              data-testid="supplier-list"
              class="fixed z-[2000] max-h-64 overflow-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
              style={{ left: `${p().left}px`, top: `${p().top}px`, width: `${p().width}px` }}
            >
              <For each={candidates()} fallback={<li class="px-2 py-1 text-muted-foreground">該当なし</li>}>
                {(s, i) => (
                  <li
                    id={`supplier-opt-${i()}`}
                    role="option"
                    aria-selected={i() === active() ? "true" : "false"}
                    class={['cursor-pointer rounded px-2 py-1', { 'bg-accent text-accent-foreground': i() === active() }]}
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerEnter={() => setActive(i())}
                    onClick={() => choose(s.code)}
                  >
                    <span class="mr-2 font-mono text-xs text-muted-foreground">{s.code}</span>
                    {s.name}
                  </li>
                )}
              </For>
            </ul>
          </Portal>
        )}
      </Show>
    </div>
  )
}
