// React 版: 科目を選ぶ custom エディタ(Solid 版と同じ作り)
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CellEditorContext } from '@ishibashi0112/spreadsheet-grid'
import { ACCOUNTS, ACCOUNT_BY_VALUE, type Expense } from './data'

const params = new URLSearchParams(location.search)

export function AccountEditor({ ctx }: { ctx: CellEditorContext<Expense> }) {
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [startText] = useState(() => (ctx.initialText === String(ctx.value ?? '') ? '' : ctx.initialText))
  const [query, setQuery] = useState(startText)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const currentLabel = ACCOUNT_BY_VALUE.get(String(ctx.value ?? ''))?.label ?? ''
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return ACCOUNTS
    return ACCOUNTS.filter((a) => a.label.includes(q) || a.kana.includes(q) || a.value.includes(q))
  }, [query])

  const choose = (value: string | undefined, direction?: 'down' | 'up' | 'right' | 'left') => {
    if (value === undefined) return
    ;(window as unknown as { __lastCommit: unknown }).__lastCommit = ctx.commit(value, direction)
  }

  useEffect(() => {
    const el = input.current!
    el.focus()
    if (startText) el.setSelectionRange(startText.length, startText.length)
    else el.select()
    let raf2 = 0
    let watching = false
    const measure = () => {
      const r = root.current!.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 2, width: Math.max(220, r.width) })
    }
    const onScroll = (event: Event) => {
      if (!watching) return
      if (event.target === document || (event.target instanceof Node && event.target.contains(root.current))) ctx.cancel()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    const n = candidates.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(n - 1, active + 1)
      setActive(next)
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(0, active - 1)
      setActive(next)
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(candidates[active]?.value, 'down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      choose(candidates[active]?.value, e.shiftKey ? 'left' : 'right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      ctx.cancel()
    }
  }

  const mount = () => (params.has('bodyportal') ? document.body : (root.current?.closest('dialog') as HTMLElement | null) ?? document.body)

  return (
    <div ref={root} className="account-editor" data-testid="account-editor">
      <input
        ref={input}
        value={query}
        placeholder={currentLabel || '科目を検索(かな可)'}
        onChange={(e) => {
          setQuery(e.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => ctx.cancel()}
        role="combobox"
        aria-label="科目"
        aria-expanded="true"
        aria-controls="account-listbox"
        aria-activedescendant={`account-opt-${active}`}
      />
      {pos &&
        createPortal(
          <ul
            ref={list}
            id="account-listbox"
            role="listbox"
            className="account-list"
            data-testid="account-list"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
          >
            {candidates.length === 0 && <li className="account-empty">該当する科目がありません</li>}
            {candidates.map((a, i) => (
              <li
                key={a.value}
                id={`account-opt-${i}`}
                role="option"
                aria-selected={i === active ? 'true' : 'false'}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(a.value)}
              >
                {a.label}
                <small>{a.kana}</small>
              </li>
            ))}
          </ul>,
          mount(),
        )}
    </div>
  )
}
