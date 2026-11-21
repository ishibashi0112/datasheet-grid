// フィルハンドルの描画部品です(状態と操作は core controllers/fillHandleController、位置の計算は primitives/fillHandle)。
//   React 版の view/FillHandleLayer.tsx と同じ DOM と class。
//   - FillHandleLayer: 各ペインの overlay 層に置く、ドラッグ中の点線 / 選択範囲の右下の四角 / 埋めたあとのボタン(座標は選択の
//     塗りと同じペインローカル)。ボタンを押すと FillOptionsMenu(連続データ / セルのコピー)を開きます。
//   - FillHandlePortals: 埋めたあとのメニューと、ドラッグ中にポインタの近くへ出す「いちばん遠いセルへ入る値」のツールチップ
//     (グリッドの外のポップアップ。描く場所は既定でグリッドを囲むダイアログの中、無ければ body)。
//   ボタン / メニューの要素はコントローラの外側クリックの判定に使うので、外したら控えを消します(React 版の ref の null)。
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Portal } from '@solidjs/web';
import type { DEFAULT_FILL_HANDLE_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { ColumnPane } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import type { FillMenuLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/fillHandleController';
import type { GridFillKind } from '@ishibashi0112/spreadsheet-grid-core';
import { useFeatureLocaleText } from '../context/localeText';
import { useGridPortal } from '../context/portal';
import { createExternalStoreSignal } from '../primitives/externalStore';
import { createPortalTokens } from '../primitives/portalTokens';
import { px } from '../primitives/style';
import type { FillHandleState } from '../primitives/fillHandle';
import { readEventKey } from '../primitives/eventKey';

type FillTexts = typeof DEFAULT_FILL_HANDLE_LOCALE_TEXT;

const SVG_NOT_FOCUSABLE = { focusable: 'false' } as Record<string, string>;

type FillHandleLayerProps = {
  fill: FillHandleState;
  pane: ColumnPane;
  headerHeight: number;
  leadingWidth: number;
  baseOffset: number;
};

export function FillHandleLayer(props: FillHandleLayerProps) {
  const corner = () => {
    const current = props.fill.corner();
    return current?.pane === props.pane ? current : null;
  };
  const chip = () => {
    const current = props.fill.chip();
    return current?.pane === props.pane ? current.position : null;
  };
  const filled = createMemo(() => {
    const snapshot = props.fill.snapshot();
    return snapshot.status === 'filled' ? snapshot : null;
  });
  return (
    <>
      {/* ドラッグ中の埋める範囲の点線。 */}
      <For each={props.fill.previewRects(props.pane)} keyed={false}>
        {(rect) => (
          <div
            class="ssg-fill-preview"
            style={{
              position: 'absolute',
              left: px(props.leadingWidth + rect().left),
              top: px(props.headerHeight + rect().top - props.baseOffset),
              width: px(rect().width),
              height: px(rect().height),
            }}
            data-ssg-fill-preview=""
          />
        )}
      </For>
      {/* 選択範囲の右下の四角。 */}
      <Show when={corner()}>
        {(current) => (
          <div
            class="ssg-fill-handle"
            style={{
              position: 'absolute',
              left: px(props.leadingWidth + current().x),
              top: px(props.headerHeight + current().y - props.baseOffset),
            }}
            data-ssg-fill-handle=""
            aria-hidden="true"
            onPointerDown={(event) => props.fill.controller.handlePointerDown(event)}
          />
        )}
      </Show>
      {/* 埋めたあとのボタン(左上の位置)。 */}
      <Show when={filled()}>
        {(snapshot) => (
          <Show when={chip()}>
            {(position) => (
              <FillOptionsChip
                fill={props.fill}
                x={props.leadingWidth + position().x}
                y={props.headerHeight + position().y - props.baseOffset}
                kind={snapshot().kind}
                menuOpen={snapshot().menu !== null}
              />
            )}
          </Show>
        )}
      </Show>
    </>
  );
}

type FillOptionsChipProps = {
  fill: FillHandleState;
  // ボタンの左上(ペインの overlay 層の座標)。
  x: number;
  y: number;
  kind: GridFillKind;
  menuOpen: boolean;
};

// 埋めたあとのボタン。押すとメニュー(連続データ / セルのコピー)を開閉します。
function FillOptionsChip(props: FillOptionsChipProps) {
  const texts = useFeatureLocaleText<FillTexts>();
  const { chipElement } = props.fill.controller;
  let element: HTMLButtonElement | undefined;
  onCleanup(() => {
    if (chipElement.current === element) {
      chipElement.current = null;
    }
  });
  return (
    <button
      ref={(node) => {
        element = node;
        chipElement.current = node;
      }}
      type="button"
      class={['ssg-fill-options', { 'ssg-fill-options--open': props.menuOpen }]}
      style={{ position: 'absolute', left: px(props.x), top: px(props.y) }}
      data-ssg-fill-options=""
      aria-label={formatLocaleText(texts().fillOptionsCurrent, {
        kind: props.kind === 'series' ? texts().fillSeries : texts().fillCopy,
      })}
      aria-haspopup="menu"
      aria-expanded={props.menuOpen ? 'true' : 'false'}
      title={texts().fillOptions}
      // フォーカスをグリッドに残します(ボタンの祖先にセルは無いため選択は始まらない)。伝播は止めません(開いている別の
      //   ポップオーバーの「外側の押下で閉じる」へ届かせる。自分のメニューはボタンを内側とみなす)。
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        props.fill.controller.toggleMenu({ left: rect.left, top: rect.top, bottom: rect.bottom });
      }}
    >
      <svg
        viewBox="0 0 16 16"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        {...SVG_NOT_FOCUSABLE}
      >
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        <path d="M6 10.5h7.5M10 7.5l3.5 3-3.5 3" />
      </svg>
      <span class="ssg-fill-options-caret" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

// 名前は文言(localeText の fillSeries / fillCopy)。
const MENU_ITEMS: { kind: GridFillKind; label: 'fillSeries' | 'fillCopy' }[] = [
  { kind: 'series', label: 'fillSeries' },
  { kind: 'copy', label: 'fillCopy' },
];

type FillOptionsMenuProps = {
  fill: FillHandleState;
  layout: FillMenuLayout;
  kind: GridFillKind;
  seriesAvailable: boolean;
  themeClassName?: string | undefined;
};

// 連続データ / セルのコピーを選ぶメニュー。開いたら選ばれている項目へフォーカスします。
function FillOptionsMenu(props: FillOptionsMenuProps) {
  const texts = useFeatureLocaleText<FillTexts>();
  const portal = useGridPortal();
  // 描く場所は開いたときに 1 回決めます(React 版は開いている間の描画ごと。開いている間に場所は変わらない)。
  const container = portal.container();
  const [panel, setPanel] = createSignal<HTMLDivElement>();
  const { menuPanel } = props.fill.controller;
  let panelElement: HTMLDivElement | undefined;
  onCleanup(() => {
    if (menuPanel.current === panelElement) {
      menuPanel.current = null;
    }
  });
  createEffect(panel, (element) => {
    element?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, { name: 'fillMenuFocus' });
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(
        panel()?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') ?? [],
      );
      const index = items.findIndex((item) => item === document.activeElement);
      const next = items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next?.focus({ preventScroll: true });
    } else if (readEventKey(event) === 'Tab') {
      event.preventDefault();
      props.fill.controller.closeMenu();
    }
    // ポップアップの中のキーはグリッドへ流しません(Escape はコントローラの window の keydown が閉じる)。
    event.stopPropagation();
  };
  const element = (
    <Show when={container}>
      {(mount) => (
        <Portal mount={mount()}>
          <div
            ref={(node) => {
              panelElement = node;
              menuPanel.current = node;
              setPanel(node);
            }}
            role="menu"
            aria-label={texts().fillOptions}
            class={['ssg-menu-panel', 'ssg-fill-menu', props.themeClassName]}
            style={{ position: 'fixed', top: px(props.layout.top), left: px(props.layout.left), 'z-index': '1000' }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            onContextMenu={(event) => event.preventDefault()}
          >
            <For each={MENU_ITEMS}>
              {(item) => {
                const disabled = () => item.kind === 'series' && !props.seriesAvailable;
                const checked = () => item.kind === props.kind;
                return (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked() ? 'true' : 'false'}
                    disabled={disabled()}
                    class={[
                      'ssg-menu-item',
                      { 'ssg-menu-item--active': checked(), 'ssg-menu-item--disabled': disabled() },
                    ]}
                    onClick={() => props.fill.controller.chooseKind(item.kind)}
                  >
                    <span class="ssg-menu-icon ssg-fill-menu-check">{checked() ? '✓' : ''}</span>
                    <span class="ssg-menu-label">{texts()[item.label]}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </Portal>
      )}
    </Show>
  );
  // 表で決まったトークン(--ssg-*)をメニューへ写します(グリッドの外なので継承で届かない)。メニューの class を書く描画の後に
  //   測るよう、JSX を作った後に作ります。
  createPortalTokens(panel, () => props.themeClassName, () => null);
  return element;
}

const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = 18;

type FillTooltipProps = {
  fill: FillHandleState;
  text: string;
  themeClassName?: string | undefined;
};

// ドラッグ中の値のツールチップ。ポインタの位置だけを購読します(シェルは描き直さない)。
function FillTooltip(props: FillTooltipProps) {
  const portal = useGridPortal();
  const pointer = createExternalStoreSignal({
    subscribe: props.fill.controller.subscribePointer,
    getSnapshot: props.fill.controller.getPointerSnapshot,
  }, 'fillPointerStore');
  const visible = createMemo(() => pointer() !== null);
  // 描く場所は出たときに決めます(ポインタが動くたびには探し直さない)。
  const container = createMemo(() => (visible() ? portal.container() : null));
  const [tooltip, setTooltip] = createSignal<HTMLDivElement>();
  const element = (
    <Show when={container()}>
      {(mount) => (
        <Portal mount={mount()}>
          <div
            ref={setTooltip}
            class={['ssg-tooltip', 'ssg-tooltip--visible', 'ssg-fill-tooltip', props.themeClassName]}
            style={{
              left: px((pointer()?.x ?? 0) + TOOLTIP_OFFSET_X),
              top: px((pointer()?.y ?? 0) + TOOLTIP_OFFSET_Y),
            }}
            aria-hidden="true"
            data-ssg-fill-tooltip=""
          >
            {props.text}
          </div>
        </Portal>
      )}
    </Show>
  );
  createPortalTokens(tooltip, () => props.themeClassName, () => null);
  return element;
}

type FillHandlePortalsProps = {
  fill: FillHandleState;
  themeClassName?: string | undefined;
};

// ルートの末尾に置く、埋めたあとのメニュー / ドラッグ中の値のツールチップ。
export function FillHandlePortals(props: FillHandlePortalsProps) {
  const menu = createMemo(() => {
    const snapshot = props.fill.snapshot();
    return snapshot.status === 'filled' && snapshot.menu !== null ? snapshot : null;
  });
  const tooltipText = createMemo(() => {
    const snapshot = props.fill.snapshot();
    return snapshot.status === 'dragging' ? snapshot.previewText : null;
  });
  return (
    <>
      <Show when={menu()}>
        {(snapshot) => (
          <Show when={snapshot().menu}>
            {(layout) => (
              <FillOptionsMenu
                fill={props.fill}
                layout={layout()}
                kind={snapshot().kind}
                seriesAvailable={snapshot().seriesAvailable}
                themeClassName={props.themeClassName}
              />
            )}
          </Show>
        )}
      </Show>
      <Show when={tooltipText() !== null}>
        <FillTooltip fill={props.fill} text={tooltipText() ?? ''} themeClassName={props.themeClassName} />
      </Show>
    </>
  );
}