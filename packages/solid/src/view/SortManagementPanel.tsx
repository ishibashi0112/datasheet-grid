// ツールパネルの「並び替え」タブの中身(並び替えの基準の一覧: 優先度・列・昇順 / 降順・削除、基準を追加 / すべてクリア、
//   ⠿ を引いて優先度を入れ替える)。React 版の view/SortManagementPanel.tsx と同じ DOM と class。並び替えの計算は持たず、
//   操作は index / キー / 向きを呼ぶ側へ渡すだけです(engine の columnCommands がその場で uiState.sort へ書く)。
//   - 優先度の入れ替えは ⠿ のポインタ(pointer capture)で、行の中ほどより上 / 下で落とし先を決めます。基準が 2 つ以上のときだけ。
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { GridSortEntry } from '@ishibashi0112/spreadsheet-grid-core';
import { usePopupLocaleText } from '../context/localeText';
import { createInputValue } from '../primitives/inputValue';
import { DragHandleGlyph } from './DragHandleGlyph';

// 並び替えに選べる列(見えている列。呼ぶ側が作る)。
export type SortManagementColumn = {
  key: string;
  title: string;
};

type SortManagementPanelProps = {
  entries: GridSortEntry[];
  columns: SortManagementColumn[];
  canSort: boolean;
  onAddLevel: (columnKey: string, direction: 'asc' | 'desc') => void;
  onChangeDirection: (index: number, direction: 'asc' | 'desc') => void;
  onChangeColumn: (index: number, columnKey: string) => void;
  onRemoveLevel: (index: number) => void;
  onClearAll: () => void;
  // 優先度の入れ替え(from = 掴んだ基準、to = 取り除いた後の差し込み先)。位置が動くときだけ呼ぶ。
  onMove: (from: number, to: number) => void;
};

// 基準 1 行の列の選択(値は今の列。描いた後に書く = 候補の option が入ってから)。
function SortColumnSelect(props: {
  value: string;
  options: SortManagementColumn[];
  disabled: boolean;
  onChange: (columnKey: string) => void;
}) {
  const bindValue = createInputValue<HTMLSelectElement>(() => props.value);
  return (
    <select
      ref={bindValue}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      class="ssg-sort-select"
    >
      <For each={props.options} keyed={(column) => column.key}>
        {(column) => <option value={column().key}>{column().title}</option>}
      </For>
    </select>
  );
}

export function SortManagementPanel(props: SortManagementPanelProps) {
  const texts = usePopupLocaleText();
  // 既に基準に使っている列のキー(列の選択の候補を絞る)。
  const usedKeys = createMemo(() => new Set(props.entries.map((entry) => entry.columnKey)));
  // 基準を追加で足す列(まだ使っていない最初の列)。
  const firstUnusedColumn = createMemo(() => props.columns.find((column) => !usedKeys().has(column.key)) ?? null);
  const titleOf = (key: string) => props.columns.find((column) => column.key === key)?.title || key;

  // ── 優先度の入れ替え ──
  const canDrag = () => props.canSort && props.entries.length >= 2;
  let listElement: HTMLDivElement | undefined;
  const [draggingIndex, setDraggingIndex] = createSignal<number | null>(null);
  // 押している間か(signal の反映を待たずに続くポインタのイベントで見る)。
  let dragActive = false;
  // 差し込み先(0..基準の数。基準の数 = 末尾)。
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);
  let pointerY = 0;

  // ポインタの縦の位置から「中ほどより上にある行の数」= 差し込み先を求めます。
  const updateDropFromPointer = () => {
    if (!listElement) {
      return;
    }
    const rows = listElement.querySelectorAll<HTMLElement>('[data-sort-level]');
    let index = rows.length;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i]!.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDropIndex(index);
  };

  const finishDrag = (commit: boolean) => {
    const from = draggingIndex();
    const rawTo = dropIndex();
    dragActive = false;
    setDraggingIndex(null);
    setDropIndex(null);
    if (commit && from !== null && rawTo !== null) {
      // 差し込み先(取り除く前の位置)→ 取り除いた後の位置へ。
      props.onMove(from, rawTo > from ? rawTo - 1 : rawTo);
    }
  };

  const handlePointerDown = (index: number, event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!canDrag()) {
      return;
    }
    // 文字の選択と行の操作を止め、グリッドへも伝えません。
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragActive = true;
    pointerY = event.clientY;
    setDraggingIndex(index);
    updateDropFromPointer();
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!dragActive) {
      return;
    }
    pointerY = event.clientY;
    updateDropFromPointer();
  };
  const handlePointerUp = () => {
    if (dragActive) {
      finishDrag(true);
    }
  };
  const handlePointerCancel = () => {
    if (dragActive) {
      finishDrag(false);
    }
  };

  const canAddLevel = () => props.canSort && firstUnusedColumn() !== null;

  return (
    <>
      {/* 基準の一覧(スクロール) */}
      <div
        ref={(element) => {
          listElement = element;
        }}
        class="ssg-sort-list"
      >
        <Show when={props.entries.length > 0} fallback={<div class="ssg-sort-empty">{texts().sortPanelEmpty}</div>}>
          <For each={props.entries} keyed={(entry) => entry.columnKey}>
            {(entry, index) => {
              // この行の列の候補: 自分の列 + ほかの基準で使っていない列。自分の列が候補に無い(後から隠した等)ときは先頭に足す。
              const options = createMemo(() => {
                const own = entry().columnKey;
                const candidates = props.columns.filter((column) => column.key === own || !usedKeys().has(column.key));
                return candidates.some((column) => column.key === own)
                  ? candidates
                  : [{ key: own, title: titleOf(own) }, ...candidates];
              });
              const isDragging = () => draggingIndex() === index();
              const showDropBefore = () => draggingIndex() !== null && dropIndex() === index();
              return (
                <div
                  data-sort-level=""
                  class={{
                    'ssg-sort-level': true,
                    'ssg-sort-level--drop-before': showDropBefore(),
                    'ssg-sort-level--dragging': isDragging(),
                  }}
                >
                  {/* ⠿ ドラッグハンドル */}
                  <span
                    role="button"
                    aria-label={texts().sortPanelDrag}
                    data-ssg-tooltip={
                      !props.canSort
                        ? texts().sortPanelDisabled
                        : props.entries.length < 2
                          ? texts().sortPanelNeedsTwo
                          : texts().sortPanelDrag
                    }
                    onPointerDown={(event) => handlePointerDown(index(), event)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    class={{
                      'ssg-sort-handle': true,
                      'ssg-sort-handle--disabled': !canDrag(),
                      'ssg-sort-handle--dragging': isDragging(),
                    }}
                  >
                    <DragHandleGlyph disabled={!canDrag()} />
                  </span>

                  {/* 優先度(1 から。見出しの優先度の番号と同じ意味) */}
                  <span aria-hidden="true" class="ssg-sort-badge">
                    {index() + 1}
                  </span>

                  <SortColumnSelect
                    value={entry().columnKey}
                    options={options()}
                    disabled={!props.canSort}
                    onChange={(columnKey) => props.onChangeColumn(index(), columnKey)}
                  />

                  {/* 昇順 / 降順。見せる文字は短い方、ツールチップと読み上げの名前は長い方。 */}
                  <div class="ssg-sort-dir-group">
                    <button
                      type="button"
                      disabled={!props.canSort}
                      onClick={() => props.onChangeDirection(index(), 'asc')}
                      aria-label={texts().sortPanelAscending}
                      data-ssg-tooltip={texts().sortPanelAscending}
                      class={{ 'ssg-sort-dir-btn': true, 'ssg-sort-dir-btn--active': entry().direction === 'asc' }}
                    >
                      ↑ {texts().sortPanelAscendingShort}
                    </button>
                    <button
                      type="button"
                      disabled={!props.canSort}
                      onClick={() => props.onChangeDirection(index(), 'desc')}
                      aria-label={texts().sortPanelDescending}
                      data-ssg-tooltip={texts().sortPanelDescending}
                      class={{ 'ssg-sort-dir-btn': true, 'ssg-sort-dir-btn--active': entry().direction === 'desc' }}
                    >
                      ↓ {texts().sortPanelDescendingShort}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!props.canSort}
                    onClick={() => props.onRemoveLevel(index())}
                    aria-label={texts().sortPanelRemove}
                    data-ssg-tooltip={texts().sortPanelRemove}
                    class="ssg-sort-delete"
                  >
                    ×
                  </button>
                </div>
              );
            }}
          </For>
        </Show>
        {/* 末尾へ落とすときの印 */}
        <Show when={draggingIndex() !== null && dropIndex() === props.entries.length}>
          <div class="ssg-sort-drop-end" />
        </Show>
      </div>

      {/* フッター: 基準を追加 / すべてクリア */}
      <div class="ssg-popover-footer">
        <button
          type="button"
          disabled={!canAddLevel()}
          onClick={() => {
            const column = firstUnusedColumn();
            if (canAddLevel() && column) {
              props.onAddLevel(column.key, 'asc');
            }
          }}
          data-ssg-tooltip={
            !props.canSort
              ? texts().sortPanelDisabled
              : firstUnusedColumn() === null
                ? texts().sortPanelAllUsed
                : texts().sortPanelAddHint
          }
          class="ssg-sort-footer-btn ssg-sort-footer-btn--add"
        >
          {texts().sortPanelAdd}
        </button>
        <button
          type="button"
          disabled={!props.canSort || props.entries.length === 0}
          onClick={() => {
            if (props.canSort && props.entries.length > 0) {
              props.onClearAll();
            }
          }}
          data-ssg-tooltip={texts().sortPanelClearHint}
          class="ssg-sort-footer-btn ssg-sort-footer-btn--clear"
        >
          {texts().clearAll}
        </button>
      </div>

      <Show when={!props.canSort}>
        <div class="ssg-sort-note">{texts().sortPanelReadOnly}</div>
      </Show>
    </>
  );
}