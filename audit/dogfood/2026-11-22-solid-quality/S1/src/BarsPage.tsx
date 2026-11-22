// 自作の上部 / 下部バー(renderTopBar / renderBottomBar)の読み方を切り替えて確かめるページ
//   ?mode=jsx         … 文脈の値を JSX の中で読む(README の勧め)
//   ?mode=body        … 関数の本体で読んで変数に入れてから JSX に置く
//   ?mode=destructure … React 版のガイドの書き方に近い、引数の分割代入
//   ?mode=mixed       … 本体では変わらない値(setGlobalFilterText)だけを読み、変わる値は JSX
import { createSignal } from 'solid-js'
import {
  SpreadsheetGrid,
  type SpreadsheetGridHandle,
  type SpreadsheetGridSlotContext,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { buildColumns, canEditCell } from './columns'
import { createItems, type Item } from './data'

declare global {
  interface Window {
    __barCalls: { top: number; bottom: number }
    __barGrid?: SpreadsheetGridHandle<Item>
    __barRows?: () => readonly Item[]
  }
}
window.__barCalls = { top: 0, bottom: 0 }

type Mode = 'jsx' | 'body' | 'destructure' | 'mixed' | 'bodyrows' | 'bodysort'
const mode = (new URLSearchParams(location.search).get('mode') ?? 'jsx') as Mode

const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('ja-JP', { maximumFractionDigits: 2 }))

function topBar(ctx: SpreadsheetGridSlotContext<Item>) {
  window.__barCalls.top++
  if (mode === 'jsx') {
    return (
      <div class="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm" data-testid="my-top">
        <input
          id="my-filter"
          class="rounded border border-slate-300 px-2 py-0.5"
          placeholder="品名などで絞り込み"
          value={ctx.globalFilterText}
          onInput={(e) => ctx.setGlobalFilterText(e.currentTarget.value)}
        />
        <span id="my-count">
          {ctx.filteredRows.length} / {ctx.rows.length} 件
        </span>
        <span id="my-sort">{ctx.derivedSummary.sortSummaryText}</span>
        <span id="my-filters">{ctx.derivedSummary.filterSummaryText}</span>
      </div>
    )
  }
  if (mode === 'body') {
    const shown = ctx.filteredRows.length
    const total = ctx.rows.length
    const sort = ctx.derivedSummary.sortSummaryText
    const filters = ctx.derivedSummary.filterSummaryText
    const text = ctx.globalFilterText
    return (
      <div class="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm" data-testid="my-top">
        <input
          id="my-filter"
          class="rounded border border-slate-300 px-2 py-0.5"
          placeholder="品名などで絞り込み"
          value={text}
          onInput={(e) => ctx.setGlobalFilterText(e.currentTarget.value)}
        />
        <span id="my-count">
          {shown} / {total} 件
        </span>
        <span id="my-sort">{sort}</span>
        <span id="my-filters">{filters}</span>
      </div>
    )
  }
  if (mode === 'bodysort') {
    // 本体では並び替えの文字だけを読む
    const sort = ctx.derivedSummary.sortSummaryText
    return (
      <div class="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm" data-testid="my-top">
        <input
          id="my-filter"
          class="rounded border border-slate-300 px-2 py-0.5"
          value={ctx.globalFilterText}
          onInput={(e) => ctx.setGlobalFilterText(e.currentTarget.value)}
        />
        <span id="my-count">
          {ctx.filteredRows.length} / {ctx.rows.length} 件
        </span>
        <span id="my-sort">{sort}</span>
        <span id="my-filters">{ctx.derivedSummary.filterSummaryText}</span>
      </div>
    )
  }
  if (mode === 'bodyrows') {
    // 本体では行の総数だけ(行が変わるときだけ変わる)を読む
    const total = ctx.rows.length
    return (
      <div class="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm" data-testid="my-top">
        <input
          id="my-filter"
          class="rounded border border-slate-300 px-2 py-0.5"
          placeholder="品名などで絞り込み"
          value={ctx.globalFilterText}
          onInput={(e) => ctx.setGlobalFilterText(e.currentTarget.value)}
        />
        <span id="my-count">
          {ctx.filteredRows.length} / {total} 件
        </span>
        <span id="my-sort">{ctx.derivedSummary.sortSummaryText}</span>
        <span id="my-filters">{ctx.derivedSummary.filterSummaryText}</span>
      </div>
    )
  }
  if (mode === 'mixed') {
    const setText = ctx.setGlobalFilterText
    return (
      <div class="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm" data-testid="my-top">
        <input
          id="my-filter"
          class="rounded border border-slate-300 px-2 py-0.5"
          placeholder="品名などで絞り込み"
          value={ctx.globalFilterText}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <span id="my-count">
          {ctx.filteredRows.length} / {ctx.rows.length} 件
        </span>
        <span id="my-sort">{ctx.derivedSummary.sortSummaryText}</span>
        <span id="my-filters">{ctx.derivedSummary.filterSummaryText}</span>
      </div>
    )
  }
  return null
}

// React 版のガイドの形: ({ derivedSummary, globalFilterText, setGlobalFilterText, filteredRows, rows }) => …
const topBarDestructure = ({
  derivedSummary,
  globalFilterText,
  setGlobalFilterText,
  filteredRows,
  rows,
}: SpreadsheetGridSlotContext<Item>) => {
  window.__barCalls.top++
  return (
    <div class="flex items-center gap-2 border-b border-slate-200 px-2 py-1 text-sm" data-testid="my-top">
      <input
        id="my-filter"
        class="rounded border border-slate-300 px-2 py-0.5"
        placeholder="品名などで絞り込み"
        value={globalFilterText}
        onInput={(e) => setGlobalFilterText(e.currentTarget.value)}
      />
      <span id="my-count">
        {filteredRows.length} / {rows.length} 件
      </span>
      <span id="my-sort">{derivedSummary.sortSummaryText}</span>
      <span id="my-filters">{derivedSummary.filterSummaryText}</span>
    </div>
  )
}

function bottomBar(ctx: SpreadsheetGridSlotContext<Item>) {
  window.__barCalls.bottom++
  if (mode === 'jsx' || mode === 'mixed' || mode === 'bodyrows' || mode === 'bodysort') {
    return (
      <div class="flex gap-3 border-t border-slate-200 px-2 py-1 text-xs" data-testid="my-bottom">
        <span id="my-active">{ctx.derivedSummary.activeCellLabel}</span>
        <span id="my-range">{ctx.derivedSummary.selectionLabel}</span>
        <span id="my-agg">
          {ctx.selectionAggregates?.status === 'ready'
            ? `合計 ${fmt(ctx.selectionAggregates.sum)} / 最小 ${fmt(ctx.selectionAggregates.min)} / 最大 ${fmt(ctx.selectionAggregates.max)}`
            : ''}
        </span>
        <span id="my-activecell">{ctx.activeCell ? `${ctx.activeCell.row},${ctx.activeCell.col}` : 'なし'}</span>
      </div>
    )
  }
  if (mode === 'body') {
    const agg = ctx.selectionAggregates
    const active = ctx.derivedSummary.activeCellLabel
    const range = ctx.derivedSummary.selectionLabel
    const ac = ctx.activeCell
    return (
      <div class="flex gap-3 border-t border-slate-200 px-2 py-1 text-xs" data-testid="my-bottom">
        <span id="my-active">{active}</span>
        <span id="my-range">{range}</span>
        <span id="my-agg">
          {agg?.status === 'ready' ? `合計 ${fmt(agg.sum)} / 最小 ${fmt(agg.min)} / 最大 ${fmt(agg.max)}` : ''}
        </span>
        <span id="my-activecell">{ac ? `${ac.row},${ac.col}` : 'なし'}</span>
      </div>
    )
  }
  return null
}

const bottomBarDestructure = ({ derivedSummary, selectionAggregates, activeCell }: SpreadsheetGridSlotContext<Item>) => {
  window.__barCalls.bottom++
  return (
    <div class="flex gap-3 border-t border-slate-200 px-2 py-1 text-xs" data-testid="my-bottom">
      <span id="my-active">{derivedSummary.activeCellLabel}</span>
      <span id="my-range">{derivedSummary.selectionLabel}</span>
      <span id="my-agg">
        {selectionAggregates?.status === 'ready'
          ? `合計 ${fmt(selectionAggregates.sum)} / 最小 ${fmt(selectionAggregates.min)} / 最大 ${fmt(selectionAggregates.max)}`
          : ''}
      </span>
      <span id="my-activecell">{activeCell ? `${activeCell.row},${activeCell.col}` : 'なし'}</span>
    </div>
  )
}

export function BarsPage() {
  const [rows, setRows] = createSignal<Item[]>(createItems(500))
  window.__barRows = () => rows()
  const columns = buildColumns({ log: () => {}, onDelete: () => {} })
  return (
    <div class="flex h-full flex-col gap-2 p-3">
      <h1 class="text-lg font-bold">自作バー({mode})</h1>
      <div class="min-h-0 flex-1">
        <SpreadsheetGrid
          ref={(h) => (window.__barGrid = h)}
          rows={rows()}
          columns={columns}
          onRowsChange={(next) => setRows(next)}
          rowKeyGetter={(row) => row.id}
          canEditCell={canEditCell}
          height="100%"
          renderTopBar={mode === 'destructure' ? topBarDestructure : topBar}
          renderBottomBar={mode === 'destructure' ? bottomBarDestructure : bottomBar}
          ariaLabel="自作バーの在庫表"
        />
      </div>
    </div>
  )
}