// 列メニュー(見出しの ⋮ / 見出しの右クリック / Alt+↓。機能 features/columnMenu の部品)のポップアップです。React 版の
//   view/ColumnMenuPopover.tsx と同じ DOM と class。項目の並び: フィルター… / 昇順・降順・並び替えを管理… / フィルターを管理… /
//   この列でグループ化・グループ化を外す / 列の固定 ›(小メニュー)/ 幅の自動調整 2 つ / 列の表示 / 列のリセット / 閉じる。
//   どの項目を出すかと押したときの処理はシェルが決めて渡します(出さない項目は渡さない)。
//   - 列の固定の小メニューはマウスのホバー / 押す / → で開き、別の項目へのホバー / ← で閉じる。メニューが画面の高さに収まらず
//     パネルの中でスクロールするときは、横に出さず項目の下に開く(ホバーでは開け閉めしない)。
//   - 開いたまま別の列へ切り替えたら、小メニューを閉じ、パネルのスクロールを先頭へ戻します(React 版と同じ)。
//   - パネルの中のポインタ / キーはグリッドへ伝えません(Escape で閉じるのはコントローラの window の keydown)。
import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup } from 'solid-js';
import { Portal } from '@solidjs/web';
import type { ColumnMenuLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/columnMenuController';
import type { DEFAULT_COLUMN_MENU_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import type { JSX } from '@solidjs/web';
import type { GridColumnPinned, GridSortDirection } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridResolvedSlots } from '../model/gridTypes';
import { useGridPortal } from '../context/portal';
import { useFeatureLocaleText } from '../context/localeText';
import { createPortalTokens } from '../primitives/portalTokens';
import { px } from '../primitives/style';

type ColumnMenuPinnedItem = {
  // undefined = 固定なし(中央のスクロール領域)。
  value: GridColumnPinned | undefined;
  label: 'menuPinNone' | 'menuPinLeft' | 'menuPinRight';
};
const PINNED_ITEMS: ColumnMenuPinnedItem[] = [
  { value: undefined, label: 'menuPinNone' },
  { value: 'left', label: 'menuPinLeft' },
  { value: 'right', label: 'menuPinRight' },
];

// 小メニューの幅と、ルートのメニューとの間隔(左右どちらへ開くかの判定にも使う。React 版と同じ値)。
const SUBMENU_WIDTH = 180;
const SUBMENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
const PIN_SUBMENU_KEY = 'pin';
// 項目の下に開いた小メニューを開いた直後の、同じ所への 2 回目のタップは項目を選ばせない(スマートフォンのダブルタップ)。
const REPEAT_TAP_MS = 500;
const REPEAT_TAP_PX = 24;
type TapPoint = { x: number; y: number; at: number };
const isRepeatTap = (first: TapPoint | null, event: MouseEvent): boolean =>
  first !== null &&
  event.detail > 0 &&
  event.timeStamp - first.at < REPEAT_TAP_MS &&
  Math.abs(event.clientX - first.x) <= REPEAT_TAP_PX &&
  Math.abs(event.clientY - first.y) <= REPEAT_TAP_PX;

type ColumnMenuPopoverProps = {
  themeClassName?: string | undefined;
  slots?: GridResolvedSlots | undefined;
  title: string;
  columnKey: string;
  // フィルター…(enableColumnFilter かつこの列に filterType があるとき)。
  canFilter: boolean;
  onOpenFilter: () => void;
  // 昇順 / 降順(enableSorting)。同じ方向をもう一度選ぶと解除(シェル)。
  canSort: boolean;
  sortDirection: GridSortDirection;
  onSortChange: (direction: Exclude<GridSortDirection, null>) => void;
  // 並び替えを管理… / フィルターを管理… / 列の表示(ツールパネルの機能があるときだけ渡す)。
  onOpenSortManager?: (() => void) | undefined;
  canManageFilters: boolean;
  onOpenFilterManager?: (() => void) | undefined;
  pinned: GridColumnPinned | undefined;
  // onColumnsChange が無いときは固定を変えられない(列定義は利用側が持つ)。
  canChangePinned: boolean;
  layout: ColumnMenuLayout;
  panelRef: { current: HTMLDivElement | null };
  onPinnedChange: (columnKey: string, pinned: GridColumnPinned | undefined) => void;
  // 幅の自動調整(機能 columnAutosize があるときだけ渡す)。
  onAutosizeColumn?: ((columnKey: string) => void) | undefined;
  onAutosizeAllColumns?: (() => void) | undefined;
  onOpenColumnChooser?: (() => void) | undefined;
  canResetColumns: boolean;
  onResetColumns: () => void;
  // この列でグループ化 / グループ化を外す(出す条件はシェルが決める)。
  onGroupByColumn?: (() => void) | undefined;
  onUngroup?: (() => void) | undefined;
  onRequestClose: () => void;
};

export function ColumnMenuPopover(props: ColumnMenuPopoverProps) {
  const texts = useFeatureLocaleText<typeof DEFAULT_COLUMN_MENU_LOCALE_TEXT>();
  const portal = useGridPortal();
  // 描く場所は開いたときに 1 回決めます(開いている間に場所は変わらない)。
  const container = portal.container();
  const [panel, setPanel] = createSignal<HTMLDivElement>();
  let panelElement: HTMLDivElement | undefined;
  onCleanup(() => {
    if (props.panelRef.current === panelElement) {
      props.panelRef.current = null;
    }
  });
  const layout = createMemo(() => props.layout);
  // 開いている小メニュー(開いた列ごと。別の列へ切り替えたら閉じた扱い)。
  const [openSubmenu, setOpenSubmenu] = createSignal<{ columnKey: string; key: string } | null>(null);
  const setOpenSubmenuKey = (key: string | null) =>
    setOpenSubmenu(key === null ? null : { columnKey: props.columnKey, key });
  const isPinSubmenuOpen = createMemo(() => {
    const current = openSubmenu();
    return current !== null && current.columnKey === props.columnKey && current.key === PIN_SUBMENU_KEY;
  });
  // 開いたまま別の列へ切り替えたら、小メニューを閉じ、パネルのスクロールを先頭へ戻す(React 版と同じ。小メニューを閉じないと、
  //   その列へ戻ったときに開いたまま出ていた = R3-1)。
  createEffect(
    () => props.columnKey,
    () => {
      setOpenSubmenu(null);
      if (panelElement) {
        panelElement.scrollTop = 0;
      }
    },
    { name: 'columnMenuScrollReset' },
  );
  // 表で決まったトークン(--ssg-*)をメニューへ写し、位置が変わるたびに描く場所のずれを打ち消します。
  createPortalTokens(panel, () => props.themeClassName, layout);
  // メニューが画面の高さに収まらずパネルの中でスクロールするときは、小メニューを項目の下に開く。
  const submenuInline = createMemo(() => layout().maxHeight !== undefined);
  // 列の固定の小メニューも同じトークンの既定値を持つ要素(.ssg-menu-panel)なので写す(項目の下に開いている間はパネルの一部)。
  const [pinSubmenu, setPinSubmenu] = createSignal<HTMLDivElement>();
  let pinSubmenuElement: HTMLDivElement | undefined;
  createPortalTokens(
    () => (isPinSubmenuOpen() && !submenuInline() ? pinSubmenu() : undefined),
    () => props.themeClassName,
    () => null,
    { origin: false },
  );
  let pinButton: HTMLButtonElement | undefined;
  let pinOpenTap: TapPoint | null = null;
  // 固定できないときの注記を、小メニューの項目の説明として読ませる。
  const pinNoteId = createUniqueId();
  // キーボード(→ / Enter / Space)で開いたときは小メニューの先頭の項目へフォーカスを移す(開いた後の描画で)。
  let focusPinSubmenuOnOpen = false;
  const focusFirstPinItem = (): boolean => {
    const item = pinSubmenuElement?.querySelector<HTMLElement>('.ssg-menu-item:not(:disabled)');
    item?.focus();
    return item != null;
  };
  createEffect(isPinSubmenuOpen, (open) => {
    if (!open) {
      return;
    }
    // 項目の下に開いたときは、開いた項目をパネルの中で見せる。
    const submenu = pinSubmenuElement;
    if (submenu?.classList.contains('ssg-menu-subgroup') && typeof submenu.scrollIntoView === 'function') {
      submenu.scrollIntoView({ block: 'nearest' });
    }
    if (!focusPinSubmenuOnOpen) {
      return;
    }
    focusPinSubmenuOnOpen = false;
    focusFirstPinItem();
  }, { name: 'columnMenuPinSubmenu' });
  const closeSubmenuOnHover = () => {
    if (!submenuInline()) {
      setOpenSubmenuKey(null);
    }
  };

  // 小メニューを右に開くと画面からはみ出すなら左へ。左でもはみ出すなら画面の中に収まる位置でルートのメニューに重ねる。
  const submenuStyle = (): JSX.CSSProperties => {
    const current = layout();
    const opensLeft = current.left + current.width + SUBMENU_GAP + SUBMENU_WIDTH > window.innerWidth - VIEWPORT_MARGIN;
    const overlapLeft =
      opensLeft && current.left - SUBMENU_GAP - SUBMENU_WIDTH < VIEWPORT_MARGIN
        ? Math.max(
            VIEWPORT_MARGIN,
            Math.min(window.innerWidth - VIEWPORT_MARGIN - SUBMENU_WIDTH, current.left - SUBMENU_GAP - SUBMENU_WIDTH),
          ) -
          (current.left + 9)
        : undefined;
    return {
      ...props.slots?.popover?.style,
      position: 'absolute',
      // パネルの padding(8) + border(1) を相殺し、小メニューの先頭の項目をルートの項目と上端でそろえる。
      top: '-9px',
      ...(overlapLeft !== undefined
        ? { left: px(overlapLeft) }
        : opensLeft
          ? { right: `calc(100% + ${SUBMENU_GAP}px)` }
          : { left: `calc(100% + ${SUBMENU_GAP}px)` }),
      width: px(SUBMENU_WIDTH),
      'z-index': '1',
    };
  };

  const itemClass = (...extra: (string | Record<string, boolean> | undefined)[]) => [
    'ssg-menu-item',
    ...extra,
    props.slots?.menuItem?.className,
  ];
  const itemStyle = () => props.slots?.menuItem?.style;

  return (
    <Show when={container}>
      {(mount) => (
        <Portal mount={mount()}>
          <div
            ref={(node) => {
              panelElement = node;
              props.panelRef.current = node;
              setPanel(node);
            }}
            // パネルの中のポインタの操作をグリッドへ伝えません(列の選択の始まりや外側の押下の判定と競合しない)。
            onPointerDown={(event) => event.stopPropagation()}
            // パネルの中のキーはグリッドへ流しません(中の要素のハンドラが先に処理する bubble 相)。
            onKeyDown={(event) => event.stopPropagation()}
            // メニューの上の右クリックではブラウザの標準のメニューを出しません。
            onContextMenu={(event) => event.preventDefault()}
            // メニューとして支援技術へ伝えます。マウスで開いたときはパネルにフォーカスを置きます(コントローラ)。
            role="menu"
            aria-label={props.title}
            tabindex={-1}
            class={['ssg-menu-panel', props.themeClassName, props.slots?.popover?.className]}
            style={{
              ...props.slots?.popover?.style,
              position: 'fixed',
              top: px(layout().top),
              left: px(layout().left),
              width: px(layout().width),
              'z-index': '1000',
              // 画面に収まらないときだけパネルの中でスクロール。
              ...(layout().maxHeight !== undefined
                ? { 'max-height': px(layout().maxHeight ?? 0), 'overflow-y': 'auto' }
                : null),
            }}
          >
            <div class="ssg-menu-title" aria-hidden="true">
              {props.title}
            </div>

            <Show when={props.canFilter}>
              <button
                type="button"
                role="menuitem"
                onPointerEnter={closeSubmenuOnHover}
                onClick={() => props.onOpenFilter()}
                class={itemClass()}
                style={itemStyle()}
              >
                <span class="ssg-menu-icon" />
                <span class="ssg-menu-label">{texts().menuFilter}</span>
              </button>
              <div role="separator" class="ssg-menu-separator" />
            </Show>

            <Show when={props.canSort}>
              <SortItem
                direction="asc"
                sortDirection={props.sortDirection}
                label={texts().menuSortAscending}
                onHover={closeSubmenuOnHover}
                onSelect={() => props.onSortChange('asc')}
                class={itemClass()}
                style={itemStyle()}
              />
              <SortItem
                direction="desc"
                sortDirection={props.sortDirection}
                label={texts().menuSortDescending}
                onHover={closeSubmenuOnHover}
                onSelect={() => props.onSortChange('desc')}
                class={itemClass()}
                style={itemStyle()}
              />
              <Show when={props.onOpenSortManager}>
                {(open) => (
                  <button
                    type="button"
                    role="menuitem"
                    onPointerEnter={closeSubmenuOnHover}
                    onClick={() => open()()}
                    class={itemClass()}
                    style={itemStyle()}
                  >
                    <span class="ssg-menu-icon" />
                    <span class="ssg-menu-label">{texts().menuManageSort}</span>
                  </button>
                )}
              </Show>
            </Show>

            <Show when={props.canManageFilters ? props.onOpenFilterManager : undefined}>
              {(open) => (
                <button
                  type="button"
                  role="menuitem"
                  onPointerEnter={closeSubmenuOnHover}
                  onClick={() => open()()}
                  class={itemClass()}
                  style={itemStyle()}
                >
                  <span class="ssg-menu-icon" />
                  <span class="ssg-menu-label">{texts().menuManageFilters}</span>
                </button>
              )}
            </Show>

            {/* 区切りは、並び替えの項目かフィルターを管理…のどちらかが出ているとき。 */}
            <Show when={props.canSort || (props.canManageFilters && props.onOpenFilterManager !== undefined)}>
              <div role="separator" class="ssg-menu-separator" />
            </Show>

            <Show when={props.onGroupByColumn}>
              {(groupBy) => (
                <button
                  type="button"
                  role="menuitem"
                  onPointerEnter={closeSubmenuOnHover}
                  onClick={() => groupBy()()}
                  class={itemClass()}
                  style={itemStyle()}
                >
                  <span class="ssg-menu-icon" />
                  <span class="ssg-menu-label">{texts().menuGroupBy}</span>
                </button>
              )}
            </Show>
            <Show when={props.onUngroup}>
              {(ungroup) => (
                <button
                  type="button"
                  role="menuitem"
                  onPointerEnter={closeSubmenuOnHover}
                  onClick={() => ungroup()()}
                  class={itemClass()}
                  style={itemStyle()}
                >
                  <span class="ssg-menu-icon" />
                  <span class="ssg-menu-label">{texts().menuUngroup}</span>
                </button>
              )}
            </Show>
            <Show when={props.onGroupByColumn !== undefined || props.onUngroup !== undefined}>
              <div role="separator" class="ssg-menu-separator" />
            </Show>

            {/* 列の固定 ›(小メニューはこの行 = position: relative を基準に置く。パネルの子孫なので外側の押下の判定にも入る)。 */}
            <div class="ssg-menu-submenu-anchor" role="none">
              <button
                ref={(node) => {
                  pinButton = node;
                }}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={isPinSubmenuOpen() ? 'true' : 'false'}
                onPointerEnter={(event) => {
                  // ホバーで開くのはマウスだけ(タッチでは押すと pointerenter が先に来て、続く click で閉じていた)。
                  if (event.pointerType === 'mouse' && !submenuInline()) {
                    setOpenSubmenuKey(PIN_SUBMENU_KEY);
                  }
                }}
                onClick={(event) => {
                  // 押すと開く(トグルではない)。キーボード(Enter / Space = detail 0)では先頭の項目へ。
                  if (event.detail === 0) {
                    if (isPinSubmenuOpen()) {
                      // 項目の下に開いていて押せる項目が無い(固定を変えられない)ときは閉じる。
                      if (!focusFirstPinItem() && submenuInline()) {
                        setOpenSubmenuKey(null);
                      }
                      return;
                    }
                    focusPinSubmenuOnOpen = true;
                  } else if (submenuInline() && isPinSubmenuOpen()) {
                    // 項目の下に開いているときは、押し直すと閉じる。
                    setOpenSubmenuKey(null);
                    return;
                  }
                  pinOpenTap = event.detail > 0 ? { x: event.clientX, y: event.clientY, at: event.timeStamp } : null;
                  setOpenSubmenuKey(PIN_SUBMENU_KEY);
                }}
                onKeyDown={(event) => {
                  // 項目の下に開いているときは、この項目の上の ← でも閉じる。
                  if (event.key === 'ArrowLeft' && submenuInline() && isPinSubmenuOpen()) {
                    event.preventDefault();
                    setOpenSubmenuKey(null);
                    return;
                  }
                  // → で小メニューを開いて先頭の項目へ。
                  if (event.key !== 'ArrowRight') {
                    return;
                  }
                  event.preventDefault();
                  if (isPinSubmenuOpen()) {
                    focusFirstPinItem();
                  } else {
                    focusPinSubmenuOnOpen = true;
                    setOpenSubmenuKey(PIN_SUBMENU_KEY);
                  }
                }}
                class={itemClass({ 'ssg-menu-item--active': isPinSubmenuOpen() })}
                style={itemStyle()}
              >
                <span class="ssg-menu-icon" />
                <span class="ssg-menu-label">{texts().menuPin}</span>
                <span class="ssg-menu-caret" aria-hidden="true">
                  ›
                </span>
              </button>
              <Show when={isPinSubmenuOpen()}>
                <div
                  ref={(node) => {
                    pinSubmenuElement = node;
                    setPinSubmenu(node);
                  }}
                  role="menu"
                  aria-label={texts().menuPin}
                  class={
                    submenuInline()
                      ? 'ssg-menu-subgroup'
                      : ['ssg-menu-panel', props.themeClassName, props.slots?.popover?.className]
                  }
                  style={submenuInline() ? undefined : submenuStyle()}
                  onKeyDown={(event) => {
                    // ← で小メニューを閉じて「列の固定」へ戻る。
                    if (event.key !== 'ArrowLeft') {
                      return;
                    }
                    event.preventDefault();
                    setOpenSubmenuKey(null);
                    pinButton?.focus();
                  }}
                >
                  <For each={PINNED_ITEMS}>
                    {(item) => {
                      const isSelected = () => props.pinned === item.value;
                      return (
                        <button
                          type="button"
                          disabled={!props.canChangePinned}
                          role="menuitemradio"
                          aria-checked={isSelected() ? 'true' : 'false'}
                          aria-describedby={props.canChangePinned ? undefined : pinNoteId}
                          onClick={(event) => {
                            if (!props.canChangePinned || (submenuInline() && isRepeatTap(pinOpenTap, event))) {
                              return;
                            }
                            // 今と同じ項目を選んでも閉じるだけ(変わらないときの判定はシェル)。
                            props.onPinnedChange(props.columnKey, item.value);
                          }}
                          class={itemClass()}
                          style={itemStyle()}
                        >
                          <span class={['ssg-menu-check', { 'ssg-menu-check--hidden': !isSelected() }]} aria-hidden="true">
                            ✓
                          </span>
                          <span class="ssg-menu-label">{texts()[item.label]}</span>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={!props.canChangePinned}>
                    <div id={pinNoteId} role="none" class="ssg-menu-note">
                      {texts().menuPinUnavailable}
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            <Show when={props.onAutosizeColumn && props.onAutosizeAllColumns}>
              <button
                type="button"
                role="menuitem"
                onPointerEnter={closeSubmenuOnHover}
                onClick={() => props.onAutosizeColumn?.(props.columnKey)}
                class={itemClass()}
                style={itemStyle()}
              >
                <span class="ssg-menu-icon" />
                <span class="ssg-menu-label">{texts().menuAutosize}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onPointerEnter={closeSubmenuOnHover}
                onClick={() => props.onAutosizeAllColumns?.()}
                class={itemClass()}
                style={itemStyle()}
              >
                <span class="ssg-menu-icon" />
                <span class="ssg-menu-label">{texts().menuAutosizeAll}</span>
              </button>
            </Show>

            <Show when={props.onOpenColumnChooser}>
              {(open) => (
                <button
                  type="button"
                  role="menuitem"
                  onPointerEnter={closeSubmenuOnHover}
                  onClick={() => open()()}
                  class={itemClass()}
                  style={itemStyle()}
                >
                  <span class="ssg-menu-icon" />
                  <span class="ssg-menu-label">{texts().menuColumns}</span>
                </button>
              )}
            </Show>

            <button
              type="button"
              role="menuitem"
              aria-disabled={props.canResetColumns ? 'false' : 'true'}
              tabindex={props.canResetColumns ? 0 : -1}
              data-ssg-tooltip={props.canResetColumns ? texts().resetColumnsHint : texts().menuResetUnavailable}
              onPointerEnter={closeSubmenuOnHover}
              onClick={() => {
                if (props.canResetColumns) {
                  props.onResetColumns();
                }
              }}
              class={itemClass({ 'ssg-menu-item--disabled': !props.canResetColumns })}
              style={itemStyle()}
            >
              <span class="ssg-menu-icon" />
              <span class="ssg-menu-label">{texts().menuResetColumns}</span>
            </button>

            <div class="ssg-menu-footer" role="none">
              <button type="button" role="menuitem" onClick={() => props.onRequestClose()} class="ssg-menu-close-btn">
                {texts().close}
              </button>
            </div>
          </div>
        </Portal>
      )}
    </Show>
  );
}

type SortItemProps = {
  direction: 'asc' | 'desc';
  sortDirection: GridSortDirection;
  label: string;
  onHover: () => void;
  onSelect: () => void;
  class: (string | Record<string, boolean> | undefined)[];
  style: JSX.CSSProperties | undefined;
};

// 昇順 / 降順の項目(今の向きに ✓、ほかは向きの矢印)。
function SortItem(props: SortItemProps) {
  const active = () => props.sortDirection === props.direction;
  return (
    <button
      type="button"
      onPointerEnter={() => props.onHover()}
      onClick={() => props.onSelect()}
      role="menuitemradio"
      aria-checked={active() ? 'true' : 'false'}
      class={props.class}
      style={props.style}
    >
      <span class={['ssg-menu-sort-icon', { 'ssg-menu-sort-icon--active': active() }]} aria-hidden="true">
        {active() ? '✓' : props.direction === 'asc' ? '↑' : '↓'}
      </span>
      <span class={['ssg-menu-label', { 'ssg-menu-label--sorted': active() }]}>{props.label}</span>
    </button>
  );
}