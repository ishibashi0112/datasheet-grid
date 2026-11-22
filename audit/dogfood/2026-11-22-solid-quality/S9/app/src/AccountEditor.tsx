// 科目を選ぶ custom エディタ。文字で絞り込み(漢字・かな・コード)、候補の一覧はポータルで表の外に出す。
//   ドキュメント(API_REFERENCE の「custom の枠」)の書き方: 根は width/height 100% + 背景色、
//   候補はセルの getBoundingClientRect から position: fixed、onMouseDown で preventDefault、
//   スクロールしたら閉じる(見張りは 2 フレーム後から)。
import { createMemo, createSignal, For, onSettled, Show, untrack } from 'solid-js'
import { Portal } from '@solidjs/web'
import type { CellEditorContext } from '@ishibashi0112/spreadsheet-grid-solid'
import { ACCOUNTS, ACCOUNT_BY_VALUE, type Expense } from './data'

const params = new URLSearchParams(location.search)

export function AccountEditor(props: { ctx: CellEditorContext<Expense> }) {
  let root!: HTMLDivElement
  let input!: HTMLInputElement
  let list: HTMLUListElement | undefined
  const ctx = untrack(() => props.ctx)
  // 打ち始めた文字(英字キー / IME の確定)はそのまま検索語に。ダブルクリック / F2 / Enter では initialText が今の値なので空から。
  const startText = ctx.initialText === String(ctx.value ?? '') ? '' : ctx.initialText
  const [query, setQuery] = createSignal(startText)
  const [active, setActive] = createSignal(0)
  const [pos, setPos] = createSignal<{ left: number; top: number; width: number } | null>(null)

  const currentLabel = ACCOUNT_BY_VALUE.get(String(ctx.value ?? ''))?.label ?? ''
  const candidates = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (q === '') return ACCOUNTS
    return ACCOUNTS.filter((a) => a.label.includes(q) || a.kana.includes(q) || a.value.includes(q))
  })

  const choose = (value: string | undefined, direction?: 'down' | 'up' | 'right' | 'left') => {
    if (value === undefined) return
    const result = ctx.commit(value, direction)
    ;(window as unknown as { __lastCommit: unknown }).__lastCommit = result
  }

  onSettled(() => {
    input.focus()
    // 打ち始めの文字のときはカーソルを末尾に、そうでなければ全選択
    if (startText) input.setSelectionRange(startText.length, startText.length)
    else input.select()
    let raf2 = 0
    let watching = false
    const measure = () => {
      const r = root.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 2, width: Math.max(220, r.width) })
    }
    const onScroll = (event: Event) => {
      if (!watching) return
      if (event.target === document || (event.target instanceof Node && event.target.contains(root))) ctx.cancel()
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
      list?.children[active()]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
      list?.children[active()]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(candidates()[active()]?.value, 'down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      choose(candidates()[active()]?.value, e.shiftKey ? 'left' : 'right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      ctx.cancel()
    }
  }

  const mountTarget = () =>
    params.has('bodyportal') ? document.body : (root.closest('dialog') as HTMLElement | null) ?? document.body

  return (
    <div ref={root} class="account-editor" data-testid="account-editor">
      <input
        ref={input}
        value={query()}
        placeholder={currentLabel || '科目を検索(かな可)'}
        onInput={(e) => {
          setQuery(e.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        // select エディタと同じく、フォーカスが外れたら取り消す
        onBlur={() => ctx.cancel()}
        role="combobox"
        aria-label="科目"
        aria-expanded="true"
        aria-controls="account-listbox"
        aria-activedescendant={`account-opt-${active()}`}
      />
      <Show when={pos()}>
        {(p) => (
          <Portal mount={mountTarget()}>
            <ul
              ref={(el) => (list = el)}
              id="account-listbox"
              role="listbox"
              class="account-list"
              data-testid="account-list"
              style={{ left: `${p().left}px`, top: `${p().top}px`, width: `${p().width}px` }}
            >
              <For each={candidates()} fallback={<li class="account-empty">該当する科目がありません</li>}>
                {(a, i) => (
                  <li
                    id={`account-opt-${i()}`}
                    role="option"
                    aria-selected={i() === active() ? 'true' : 'false'}
                    class={{ active: i() === active() }}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerEnter={() => setActive(i())}
                    onClick={() => choose(a.value)}
                  >
                    {a.label}
                    <small>{a.kana}</small>
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
