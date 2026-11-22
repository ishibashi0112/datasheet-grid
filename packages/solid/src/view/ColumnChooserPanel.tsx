// ツールパネルの「列」タブの中身(列の表示 / 非表示: 検索・すべて表示 / 1 列を残して外す・列ごとの切り替え・列のリセット、
//   ⠿ を引いて同じ固定の区分の中で並べ替える)。React 版の view/ColumnChooserPanel.tsx と同じ DOM と class。
//   - 一覧は固定の区分(左に固定 / 固定しない / 右に固定)ごとの小見出しに分ける(区分が 1 つだけなら小見出しを出さない)。
//   - 並べ替えは onColumnsChange があって検索の文字が空のときだけ、同じ区分の中だけ。確定したら全列のキーの並び(左 → 中央 →
//     右)を呼ぶ側へ渡す(動かない落とし方では呼ばない)。一覧の上下の端では一覧をスクロールする。
//   - 表示中が 1 列だけのときは、その列を外せない(0 列にしない)。行のグループ化の最中のグループ元の列は切り替えられない。
//   - 開いている間にこのタブへ切り替えたときだけ検索欄へフォーカスを移す(開いたときは選ばれているタブ。タッチが主の端末では
//     動かさない = ソフトウェアキーボードが出るため)。
import { For, Show, createMemo, createSignal, onCleanup, onSettled } from 'solid-js';
import type { ColumnPane } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { usePopupLocaleText } from '../context/localeText';
import { createInputValue } from '../primitives/inputValue';
import { DragHandleGlyph } from './DragHandleGlyph';
import { getDeepActiveElement } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/shadowDom';

export type ColumnChooserItem = {
  key: string;
  title: string;
  visible: boolean;
  pane: ColumnPane;
  // 行のグループ化の最中のグループ元の列(値は自動グループ列に出ていて、列としては出ていない)。
  grouped?: boolean | undefined;
};

type ColumnChooserPanelProps = {
  items: ColumnChooserItem[];
  // onColumnsChange が無いときは false(切り替えられない。注記を出す)。
  canToggle: boolean;
  onToggleColumnVisibility: (columnKey: string, nextVisible: boolean) => void;
  onShowAllColumns: () => void;
  onHideAllColumns: () => void;
  onResetColumns: () => void;
  onReorderColumns: (orderedKeys: string[]) => void;
};

// ドラッグ中に一覧の上下の端(px)へ入ったら、1 フレームにこれだけスクロールする(React 版と同じ値)。
const AUTO_SCROLL_EDGE = 28;
const AUTO_SCROLL_SPEED = 12;
const PANE_ORDER: ColumnPane[] = ['left', 'center', 'right'];
const SECTION_LABELS = {
  left: 'columnsPinnedLeft',
  center: 'columnsUnpinned',
  right: 'columnsPinnedRight',
} as const satisfies Record<ColumnPane, string>;

// 同じ区分の中で並べ替え、左 → 中央 → 右の順に全列のキーを並べて返します(動かないときは null)。React 版と同じ。
function computeSectionReorderedKeys(
  items: ColumnChooserItem[],
  fromKey: string,
  dropIndexInPane: number,
): string[] | null {
  const from = items.find((item) => item.key === fromKey);
  if (!from) {
    return null;
  }
  const groups: Record<ColumnPane, string[]> = { left: [], center: [], right: [] };
  for (const item of items) {
    groups[item.pane].push(item.key);
  }
  const source = groups[from.pane];
  const fromIndex = source.indexOf(fromKey);
  if (fromIndex < 0) {
    return null;
  }
  let to = dropIndexInPane;
  if (to > fromIndex) {
    to -= 1;
  }
  to = Math.max(0, Math.min(to, source.length - 1));
  if (to === fromIndex) {
    return null;
  }
  const [moved] = source.splice(fromIndex, 1);
  source.splice(to, 0, moved!);
  return [...groups.left, ...groups.center, ...groups.right];
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate';

// 3 つの状態を持つ見た目だけのチェックボックス(角丸。押下はボタンの側)。
function CheckBox(props: { state: CheckState; disabled: boolean }) {
  return (
    <span
      class={{
        'ssg-checkbox': true,
        'ssg-checkbox--filled': props.state === 'checked' || props.state === 'indeterminate',
        'ssg-checkbox--disabled': props.disabled,
      }}
      aria-hidden="true"
    >
      <Show when={props.state === 'checked'}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 4.7 8.4 9.5 3.6"
            // stroke も属性では var() を読まないので style で。無効のときは濃い灰色(React 版と同じ)。
            style={{ stroke: props.disabled ? 'var(--ssg-panel-text-muted)' : 'var(--ssg-panel-accent-contrast)' }}
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </Show>
      <Show when={props.state === 'indeterminate'}>
        <span class="ssg-checkbox-dash" />
      </Show>
    </span>
  );
}

export function ColumnChooserPanel(props: ColumnChooserPanelProps) {
  const texts = usePopupLocaleText();
  const [query, setQuery] = createSignal('');
  let searchInput: HTMLInputElement | undefined;
  const bindQuery = createInputValue<HTMLInputElement>(query);

  // 開いている間にこのタブへ切り替えたとき(フォーカスがパネルの中にある)だけ、描いた後に検索欄へ。パネルの中にあるかは
  //   作った時点で見ます(パネルが開いたときのフォーカスの移動より前)。
  const focusSearchOnMount =
    typeof document !== 'undefined' && getDeepActiveElement()?.closest('.ssg-toolpanel') != null;
  let focusFrame: number | null = null;
  onSettled(() => {
    if (
      !searchInput ||
      !focusSearchOnMount ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
    ) {
      return;
    }
    const input = searchInput;
    focusFrame = requestAnimationFrame(() => {
      focusFrame = null;
      input.focus();
    });
  });

  // すべて表示 / 外すの判定は検索の前の全列で見ます。グループ元の列は列として出ていないので数えません。
  const toggleableCount = createMemo(() => props.items.filter((item) => item.grouped !== true).length);
  const visibleCount = createMemo(
    () => props.items.filter((item) => item.visible && item.grouped !== true).length,
  );
  const allVisible = () => visibleCount() === toggleableCount() && toggleableCount() > 0;
  // 全表示 = チェック、一部が隠れている = 中間(最後の 1 列は外せないので「全部外れた」は無い)。
  const masterState = (): CheckState => (allVisible() ? 'checked' : 'indeterminate');
  const masterActionLabel = () => (allVisible() ? texts().columnsHideAll : texts().columnsShowAll);

  const filteredItems = createMemo(() => {
    const q = query().trim().toLowerCase();
    return q ? props.items.filter((item) => item.title.toLowerCase().includes(q)) : props.items;
  });
  // 区分ごとに分けます(空の区分は出さない)。
  const sections = createMemo(() => {
    const groups: Record<ColumnPane, ColumnChooserItem[]> = { left: [], center: [], right: [] };
    for (const item of filteredItems()) {
      groups[item.pane].push(item);
    }
    return PANE_ORDER.map((pane) => ({ pane, items: groups[pane] })).filter((section) => section.items.length > 0);
  });
  const showHeadings = () => sections().length >= 2;

  // ── ドラッグで並べ替え ──
  const canDrag = () => props.canToggle && query().trim() === '';
  let listElement: HTMLDivElement | undefined;
  const [draggingKey, setDraggingKey] = createSignal<string | null>(null);
  // 押している間か / 掴んだ列の区分(signal の反映を待たずに続くポインタのイベントで見る)。
  let dragActive = false;
  let dragPane: ColumnPane | null = null;
  // 差し込み先(掴んだ列の区分の中の 0..件数)。
  const [dropIndex, setDropIndex] = createSignal<number | null>(null);
  let pointerY = 0;
  let autoScrollFrame: number | null = null;
  onCleanup(() => {
    if (focusFrame !== null) {
      cancelAnimationFrame(focusFrame);
    }
    if (autoScrollFrame !== null) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
  });

  // ポインタの縦の位置から、掴んだ列の区分の行のうち「中ほどより上にある行の数」= 差し込み先を求めます(区分をまたがない)。
  const updateDropFromPointer = () => {
    if (!listElement || !dragPane) {
      return;
    }
    const rows = listElement.querySelectorAll<HTMLElement>(`[data-chooser-row][data-chooser-pane="${dragPane}"]`);
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

  // ドラッグ中に一覧の上下の端へ入ったら一覧をスクロールします。
  const autoScrollTick = () => {
    if (!listElement || !dragActive) {
      autoScrollFrame = null;
      return;
    }
    const rect = listElement.getBoundingClientRect();
    const delta =
      pointerY < rect.top + AUTO_SCROLL_EDGE
        ? -AUTO_SCROLL_SPEED
        : pointerY > rect.bottom - AUTO_SCROLL_EDGE
          ? AUTO_SCROLL_SPEED
          : 0;
    if (delta !== 0) {
      const before = listElement.scrollTop;
      listElement.scrollTop += delta;
      if (listElement.scrollTop !== before) {
        updateDropFromPointer();
      }
    }
    autoScrollFrame = requestAnimationFrame(autoScrollTick);
  };

  const finishDrag = (commit: boolean) => {
    if (autoScrollFrame !== null) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
    const key = draggingKey();
    const target = dropIndex();
    dragActive = false;
    dragPane = null;
    setDraggingKey(null);
    setDropIndex(null);
    if (commit && key !== null && target !== null) {
      const next = computeSectionReorderedKeys(props.items, key, target);
      if (next) {
        props.onReorderColumns(next);
      }
    }
  };

  const handlePointerDown = (key: string, pane: ColumnPane, event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!canDrag()) {
      return;
    }
    // 文字の選択と行の押下を止め、グリッドへも伝えません。
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragActive = true;
    dragPane = pane;
    pointerY = event.clientY;
    setDraggingKey(key);
    updateDropFromPointer();
    if (autoScrollFrame === null) {
      autoScrollFrame = requestAnimationFrame(autoScrollTick);
    }
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

  const handleMasterClick = () => {
    if (!props.canToggle) {
      return;
    }
    // 全表示のときは先頭の 1 列を残して外し、一部が隠れていればすべて表示(どちらも 0 列にはならない)。
    if (allVisible()) {
      props.onHideAllColumns();
    } else {
      props.onShowAllColumns();
    }
  };

  // 掴んでいる列の区分(差し込みの印は掴んだ区分にだけ出す)。
  const draggingPane = createMemo((): ColumnPane | null => {
    const key = draggingKey();
    return key === null ? null : (props.items.find((item) => item.key === key)?.pane ?? null);
  });

  // 区分(pane)は項目の pane と同じ(区分をまたいだ項目は別の区分の For で作り直される)。
  const renderRow = (item: () => ColumnChooserItem, indexInPane: () => number) => {
    const disabled = () => {
      const current = item();
      // 表示中が 1 列だけのとき、その列は外せません。
      const isOnlyVisible = current.visible && visibleCount() === 1;
      return !props.canToggle || isOnlyVisible || current.grouped === true;
    };
    const isDragging = () => draggingKey() === item().key;
    const showDropBefore = () => draggingKey() !== null && draggingPane() === item().pane && dropIndex() === indexInPane();
    const shown = () => item().visible && item().grouped !== true;
    return (
      <div
        data-chooser-row=""
        data-chooser-pane={item().pane}
        class={{
          'ssg-chooser-row': true,
          'ssg-chooser-row--drop-before': showDropBefore(),
          'ssg-chooser-row--dragging': isDragging(),
        }}
      >
        {/* ⠿ ドラッグハンドル */}
        <span
          role="button"
          aria-label={texts().columnsDragToReorder}
          data-ssg-tooltip={
            !props.canToggle
              ? texts().columnsReorderUnavailable
              : query().trim() !== ''
                ? texts().columnsReorderWhileSearching
                : texts().columnsDragWithinSection
          }
          onPointerDown={(event) => handlePointerDown(item().key, item().pane, event)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          class={{
            'ssg-chooser-handle': true,
            'ssg-chooser-handle--disabled': !canDrag(),
            'ssg-chooser-handle--dragging': isDragging(),
          }}
        >
          <DragHandleGlyph disabled={!canDrag()} />
        </span>

        {/* 表示中かどうかを aria-pressed で伝えます(押せないときも今の状態を読み上げる)。 */}
        <button
          type="button"
          disabled={disabled()}
          aria-pressed={shown() ? 'true' : 'false'}
          data-ssg-tooltip={item().grouped ? texts().columnsGroupedHint : undefined}
          onClick={() => {
            if (!disabled()) {
              props.onToggleColumnVisibility(item().key, !item().visible);
            }
          }}
          class="ssg-chooser-toggle"
        >
          <CheckBox state={shown() ? 'checked' : 'unchecked'} disabled={disabled()} />
          <span
            class={{
              'ssg-chooser-label': true,
              'ssg-chooser-label--muted': disabled() && (!item().visible || item().grouped === true),
            }}
          >
            {item().grouped ? formatLocaleText(texts().groupedColumnTitle, { column: item().title }) : item().title}
          </span>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* 検索の行: すべて表示 / 外す + 検索欄 */}
      <div class="ssg-chooser-search-row">
        <button
          type="button"
          disabled={!props.canToggle}
          onClick={handleMasterClick}
          aria-label={masterActionLabel()}
          data-ssg-tooltip={masterActionLabel()}
          class="ssg-chooser-master-btn"
        >
          <CheckBox state={masterState()} disabled={!props.canToggle} />
        </button>
        <div class="ssg-chooser-search-field">
          <span aria-hidden="true" class="ssg-chooser-search-icon">
            ⌕
          </span>
          <input
            ref={(element) => {
              searchInput = element;
              bindQuery(element);
            }}
            type="text"
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder={texts().columnsSearchPlaceholder}
            // 名前が placeholder だけにならないよう、同じ文字を名前にします。
            aria-label={texts().columnsSearchPlaceholder}
            class="ssg-chooser-search-input"
          />
        </div>
      </div>

      {/* 列の一覧(スクロール)。onColumnsChange が無い表では中の項目がどれも押せないので、一覧そのものに Tab で止まる。 */}
      <div
        ref={(element) => {
          listElement = element;
        }}
        class="ssg-chooser-list"
        tabindex={props.canToggle ? undefined : 0}
      >
        <Show when={filteredItems().length > 0} fallback={<div class="ssg-chooser-empty">{texts().columnsNoMatches}</div>}>
          <For each={sections()} keyed={(section) => section.pane}>
            {(section) => (
              <div data-chooser-section={section().pane}>
                <Show when={showHeadings()}>
                  <div class="ssg-chooser-section-heading">{texts()[SECTION_LABELS[section().pane]]}</div>
                </Show>
                <For each={section().items} keyed={(item) => item.key}>
                  {(item, indexInPane) => renderRow(item, indexInPane)}
                </For>
                {/* 区分の末尾へ落とすときの印 */}
                <Show
                  when={
                    draggingKey() !== null &&
                    draggingPane() === section().pane &&
                    dropIndex() === section().items.length
                  }
                >
                  <div class="ssg-chooser-drop-end" />
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* フッター: 列のリセット +(切り替えられないときの)注記 */}
      <div class="ssg-chooser-footer">
        <button
          type="button"
          disabled={!props.canToggle}
          onClick={() => {
            if (props.canToggle) {
              props.onResetColumns();
            }
          }}
          data-ssg-tooltip={texts().resetColumnsHint}
          class="ssg-chooser-reset-btn"
        >
          {texts().columnsReset}
        </button>
        <Show when={!props.canToggle}>
          <div class="ssg-chooser-note">{texts().columnsUnavailable}</div>
        </Show>
      </div>
    </>
  );
}