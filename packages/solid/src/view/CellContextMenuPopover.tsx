// セル / 行番号の右クリックメニュー(enableContextMenu + getContextMenuItems)のポップアップです。React 版の
//   view/CellContextMenuPopover.tsx と同じ DOM と class。ライブラリは既定の項目を持たず、getContextMenuItems が返した項目
//   (action / label / separator / custom)だけを描きます。外装は列メニューと同じ .ssg-menu-panel / .ssg-menu-item。
//   - 描く場所は既定でグリッドを囲むダイアログの中、無ければ body(グリッドの外なので、表で決まったトークンを写す)。
//   - パネルの中のポインタ / キーはグリッドへ伝えません(Escape で閉じるのはコントローラの window の keydown)。
//   - パネルの要素はコントローラの外側の押下の判定と開いた後のフォーカスに使うので、外したら控えを消します(React 版の ref の null)。
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup } from 'solid-js';
import { Portal } from '@solidjs/web';
import type { CellContextMenuLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/contextMenuController';
import type { GridContextMenuItem, GridResolvedSlots } from '../model/gridTypes';
import { useGridPortal } from '../context/portal';
import { createPortalTokens } from '../primitives/portalTokens';
import { px } from '../primitives/style';
import { callInOwnFrame } from '../primitives/userCallback';

type CellContextMenuPopoverProps = {
  items: readonly GridContextMenuItem[];
  layout: CellContextMenuLayout;
  panelRef: { current: HTMLDivElement | null };
  onRequestClose: () => void;
  // メニューの読み上げの名前(localeText の contextMenuCell / contextMenuRow)。
  ariaLabel?: string | undefined;
  themeClassName?: string | undefined;
  slots?: GridResolvedSlots | undefined;
};

export function CellContextMenuPopover(props: CellContextMenuPopoverProps) {
  const portal = useGridPortal();
  // 描く場所は開いたときに 1 回決めます(React 版は開いている間の描画ごと。開いている間に場所は変わらない)。
  const container = portal.container();
  const [panel, setPanel] = createSignal<HTMLDivElement>();
  let panelElement: HTMLDivElement | undefined;
  onCleanup(() => {
    if (props.panelRef.current === panelElement) {
      props.panelRef.current = null;
    }
  });
  const layout = createMemo(() => props.layout);
  const element = (
    <Show when={container}>
      {(mount) => (
        <Portal mount={mount()}>
          <div
            ref={(node) => {
              panelElement = node;
              props.panelRef.current = node;
              setPanel(node);
            }}
            role="menu"
            aria-label={props.ariaLabel}
            // 右クリックで開いたときはパネルにフォーカスを置きます(コントローラ)。
            tabindex={-1}
            // パネルの中のポインタの操作をグリッドへ伝えません(列の選択の始まりや外側の押下の判定と競合しない)。
            onPointerDown={(event) => event.stopPropagation()}
            // パネルの中のキーはグリッドへ流しません(中の要素のハンドラが先に処理する bubble 相。Escape で閉じるのは
            //   コントローラの capture の keydown)。
            onKeyDown={(event) => event.stopPropagation()}
            // メニューの上の右クリックではブラウザの標準のメニューを出しません。
            onContextMenu={(event) => event.preventDefault()}
            class={['ssg-menu-panel', props.themeClassName, props.slots?.popover?.className]}
            style={{
              ...props.slots?.popover?.style,
              position: 'fixed',
              top: px(layout().top),
              left: px(layout().left),
              width: px(layout().width),
              'z-index': '1000',
              // 画面に収まらないときは高さを抑えてスクロール(列メニューと同じ)。
              ...(layout().maxHeight !== undefined
                ? { 'max-height': px(layout().maxHeight ?? 0), 'overflow-y': 'auto' }
                : null),
            }}
          >
            <For each={props.items}>
              {(item) => (
                <Switch
                  fallback={
                    // action(kind 省略 or 'action')。押すと onSelect の後に閉じる。disabled は button の disabled で押せない。
                    <ActionItem
                      item={item as Extract<GridContextMenuItem, { onSelect: unknown }>}
                      onRequestClose={props.onRequestClose}
                      slots={props.slots}
                    />
                  }
                >
                  {/* 区切り線(role="menu" の中の区切りとして公開)。 */}
                  <Match when={item.kind === 'separator'}>
                    <div role="separator" class="ssg-menu-separator" />
                  </Match>
                  {/* 見出し(押せない)。 */}
                  <Match when={item.kind === 'label' ? item : undefined}>
                    {(label) => (
                      <div class="ssg-menu-section-label" role="presentation">
                        {label().label}
                      </div>
                    )}
                  </Match>
                  {/* 自由に描く項目(閉じる関数を渡す)。 */}
                  <Match when={item.kind === 'custom' ? item : undefined}>
                    {(custom) => <div role="none">{custom().render({ close: props.onRequestClose })}</div>}
                  </Match>
                </Switch>
              )}
            </For>
          </div>
        </Portal>
      )}
    </Show>
  );
  // 表で決まったトークン(--ssg-*)をメニューへ写し、位置が変わるたびに描く場所のずれを打ち消します。
  createPortalTokens(panel, () => props.themeClassName, layout);
  return element;
}

type ActionItemProps = {
  item: Extract<GridContextMenuItem, { onSelect: unknown }>;
  onRequestClose: () => void;
  slots?: GridResolvedSlots | undefined;
};

function ActionItem(props: ActionItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.item.disabled}
      onClick={() => {
        // 利用者の onSelect は自分のフレームで呼ぶ(その中で action を始めても、メニューはすぐ閉じる。段階 4 の測り直し S4-21)。
        callInOwnFrame(props.item.onSelect);
        props.onRequestClose();
      }}
      class={[
        'ssg-menu-item',
        {
          'ssg-menu-item--danger': props.item.danger ?? false,
          'ssg-menu-item--disabled': props.item.disabled ?? false,
        },
        props.slots?.menuItem?.className,
      ]}
      style={props.slots?.menuItem?.style}
    >
      {/* 左 14px のアイコンの枠(未指定でも空の枠で、ほかの項目と名前の左端をそろえる)。 */}
      <span class="ssg-menu-icon">{props.item.icon}</span>
      <span class="ssg-menu-label">{props.item.label}</span>
    </button>
  );
}