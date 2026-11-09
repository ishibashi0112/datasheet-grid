import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CellEditorContext } from '@ishibashi0112/spreadsheet-grid'
import { searchCatalog, type CatalogItem, type Row } from './data'

// 品名の custom エディタ。入力すると品目マスタを非同期に検索し、候補をポップアップで出す。
// ↑↓ で候補を選び Enter / Tab で確定、Esc で取り消し。候補を選ぶと単位と単価も入る(setValue 側で展開)。
export type CatalogPick = { catalog: CatalogItem }

export const isCatalogPick = (v: unknown): v is CatalogPick =>
  typeof v === 'object' && v !== null && 'catalog' in v

type Props = { ctx: CellEditorContext<Row>; popupMode: 'inline' | 'portal' }

export function ItemNameEditor({ ctx, popupMode }: Props) {
  const initial = ctx.initialText !== '' ? ctx.initialText : String(ctx.value ?? '')
  const [text, setText] = useState(initial)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const done = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    const len = input.value.length
    input.setSelectionRange(len, len)
  }, [])

  useLayoutEffect(() => {
    if (popupMode === 'portal' && rootRef.current) setAnchor(rootRef.current.getBoundingClientRect())
  }, [popupMode, items.length])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      searchCatalog(text, ac.signal)
        .then((hits) => {
          setItems(hits)
          setHighlight(hits.length > 0 && text.trim() !== '' ? 0 : -1)
          setLoading(false)
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setError('候補を取得できませんでした')
          setLoading(false)
        })
    }, 150)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [text])

  const commitPick = (item: CatalogItem, direction?: 'down' | 'right' | 'left') => {
    if (done.current) return
    done.current = true
    ctx.commit({ catalog: item } satisfies CatalogPick, direction)
  }
  const commitText = (direction?: 'down' | 'right' | 'left') => {
    if (done.current) return
    done.current = true
    ctx.commit(text, direction)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(items.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(-1, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = highlight >= 0 ? items[highlight] : undefined
      if (pick) commitPick(pick, 'down')
      else commitText('down')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const dir = e.shiftKey ? 'left' : 'right'
      const pick = highlight >= 0 ? items[highlight] : undefined
      if (pick) commitPick(pick, dir)
      else commitText(dir)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      done.current = true
      ctx.cancel()
    }
  }

  const list = (
    <ul
      className={`name-suggest name-suggest--${popupMode}`}
      role="listbox"
      id="name-suggest-list"
      style={
        popupMode === 'portal' && anchor
          ? { position: 'fixed', left: anchor.left, top: anchor.bottom, width: Math.max(anchor.width, 320) }
          : undefined
      }
    >
      {loading && items.length === 0 && <li className="name-suggest__status">検索中…</li>}
      {error && <li className="name-suggest__status name-suggest__status--error">{error}</li>}
      {!loading && !error && items.length === 0 && <li className="name-suggest__status">該当する品目がありません</li>}
      {items.map((it, i) => (
        <li
          key={it.code}
          role="option"
          aria-selected={i === highlight}
          className={i === highlight ? 'is-active' : undefined}
          // mousedown で input の blur を止める(blur で確定させないため)
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commitPick(it)}
          onMouseEnter={() => setHighlight(i)}
        >
          <span className="name-suggest__code">{it.code}</span>
          <span className="name-suggest__name">{it.name}</span>
          <span className="name-suggest__meta">
            {it.unit} / ¥{it.price.toLocaleString('ja-JP')}
          </span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="name-editor" ref={rootRef}>
      <input
        ref={inputRef}
        className="name-editor__input"
        value={text}
        role="combobox"
        aria-expanded="true"
        aria-controls="name-suggest-list"
        aria-autocomplete="list"
        aria-label="品名"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commitText()}
      />
      {popupMode === 'portal' ? createPortal(list, document.body) : list}
    </div>
  )
}
