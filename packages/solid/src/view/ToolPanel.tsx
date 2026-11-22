// ツールパネル(フィルター / 列 / 並び替えの 3 タブ。機能 features/toolPanel の部品)の枠です。React 版の view/ToolPanel.tsx と
//   同じ DOM と class。グリッドの外(既定は body、グリッドを囲むダイアログがあればその中)へ描きます。
//   - ヘッダー: タブ(スライドする印 + 件数のバッジ)と ×。ヘッダーを掴んでパネルを動かせます(core の
//     controllers/panelHeaderDragController。位置を覚えるのはツールパネルのコントローラ)。
//   - 本体: 開いているタブの中身(呼ぶ側がタブに応じて選んで渡す。タブを切り替えると中身は作り直す)。
//   - 開いたら選ばれているタブへフォーカスを移します。開いたまま開き直したら(flashTick が増えたら)枠を一瞬光らせます。
//   - Tab はパネルの中で回し、パネルの中のポインタ / キーはグリッドへ伝えません(Escape で閉じるのはコントローラ)。
//   呼ぶ側は開いている間だけ描きます(React 版は閉じている間 null を返す)。
import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onSettled, untrack } from 'solid-js';
import { Portal } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { createPanelHeaderDragController } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/panelHeaderDragController';
import type {
  ToolPanelLayout,
  ToolPanelTab,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/toolPanelController';
import { resolveFocusWrapTarget } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/focusCycle';
import { isImeComposingKeyEvent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/domGuards';
import type { GridResolvedSlot } from '../model/gridTypes';
import { useGridPortal } from '../context/portal';
import { usePopupLocaleText } from '../context/localeText';
import { createPortalTokens } from '../primitives/portalTokens';
import { px } from '../primitives/style';
import { readEventKey } from '../primitives/eventKey';
import { getActiveElement } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/shadowDom';

// タブ 1 つぶんの表示(badge は件数。undefined / 0 は出さない)。
export type ToolPanelTabDescriptor = {
  tab: ToolPanelTab;
  label: string;
  badge?: number | undefined;
};

type ToolPanelProps = {
  themeClassName?: string | undefined;
  popoverSlot?: GridResolvedSlot | undefined;
  activeTab: ToolPanelTab;
  flashTick: number;
  tabs: ToolPanelTabDescriptor[];
  layout: ToolPanelLayout;
  panelRef: { current: HTMLDivElement | null };
  onSelectTab: (tab: ToolPanelTab) => void;
  onRequestClose: () => void;
  onPanelMove: (top: number, left: number) => void;
  children: JSX.Element;
};

const FLASH_CLASS_NAME = 'ssg-toolpanel--flash';

export function ToolPanel(props: ToolPanelProps) {
  const texts = usePopupLocaleText();
  const portal = useGridPortal();
  // 描く場所は開いたときに 1 回決めます。
  const container = portal.container();
  const tabIdBase = createUniqueId();
  const dragController = createPanelHeaderDragController();
  const [panel, setPanel] = createSignal<HTMLDivElement>();
  let panelNode: HTMLDivElement | undefined;
  onCleanup(() => {
    dragController.dispose();
    panelNode?.removeEventListener('keydown', handleKeyDownCapture, true);
    if (props.panelRef.current === panelNode) {
      props.panelRef.current = null;
    }
  });
  const layout = createMemo(() => props.layout);
  // 表で決まったトークン(--ssg-*)をパネルへ写し、位置が変わるたびに描く場所のずれを打ち消します。
  createPortalTokens(panel, () => props.themeClassName, layout);

  // 開いたら選ばれているタブへフォーカスを移します(既にパネルの中にあれば動かさない)。
  onSettled(() => {
    const element = panelNode;
    if (!element || element.contains(getActiveElement(element))) {
      return;
    }
    const target = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? element;
    target.focus({ preventScroll: true });
  });

  // 開いたまま開き直したら(flashTick が増えたら)枠を一瞬光らせます。クラスは直付けして animationend で外す(連打でも
  //   付け直して再生させる)。開いたときの値では光らせない(閉 → 開では増えない)。
  const openedTick = untrack(() => props.flashTick);
  createEffect(
    () => props.flashTick,
    (tick) => {
      const element = panelNode;
      if (!element || tick === 0 || tick === openedTick) {
        return;
      }
      element.classList.remove(FLASH_CLASS_NAME);
      void element.offsetWidth;
      element.classList.add(FLASH_CLASS_NAME);
      const handleEnd = () => element.classList.remove(FLASH_CLASS_NAME);
      element.addEventListener('animationend', handleEnd);
      return () => element.removeEventListener('animationend', handleEnd);
    },
    { name: 'toolPanelFlash' },
  );

  const activeIndex = createMemo(() =>
    Math.max(
      0,
      props.tabs.findIndex((descriptor) => descriptor.tab === props.activeTab),
    ),
  );
  // 画面の中に収まる高さは変数で渡します(styles.css の .ssg-toolpanel が使う。classNames.popover の style の max-height で
  //   変えられるように inline の max-height にはしない。React 版と同じ)。
  const panelStyle = createMemo(
    (): JSX.CSSProperties => ({
      ...props.popoverSlot?.style,
      top: px(layout().top),
      left: px(layout().left),
      width: px(layout().width),
      '--ssg-toolpanel-max-height': px(layout().maxHeight),
    }),
  );

  // Tab はパネルの中で回します(中の部品がキーの伝播を止めるので capture 相で見る)。
  const handleKeyDownCapture = (event: KeyboardEvent) => {
    if (readEventKey(event) !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || isImeComposingKeyEvent(event)) {
      return;
    }
    const next = resolveFocusWrapTarget(
      event.currentTarget as HTMLElement,
      event.target instanceof Element ? event.target : null,
      event.shiftKey,
    );
    if (next !== null) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <Show when={container}>
      {(mount) => (
        <Portal mount={mount()}>
          <div
            ref={(node) => {
              panelNode = node;
              props.panelRef.current = node;
              setPanel(node);
              node.addEventListener('keydown', handleKeyDownCapture, true);
            }}
            // パネルの中のポインタ / キーをグリッドへ伝えません(Escape で閉じるのはコントローラの window の keydown)。
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            // 支援技術にダイアログとして伝えます(モーダルではないので aria-modal は付けない)。
            role="dialog"
            aria-label={texts().toolPanelLabel}
            tabindex={-1}
            class={['ssg-popover', 'ssg-toolpanel', props.themeClassName, props.popoverSlot?.className]}
            style={panelStyle()}
          >
            {/* ヘッダー: タブ + ×(掴んで動かせる) */}
            <div
              class="ssg-toolpanel-header ssg-popover-header--draggable"
              onPointerDown={(event) =>
                dragController.startFromPointerDown(event, { layout: props.layout, onMove: props.onPanelMove })
              }
            >
              <div
                class="ssg-toolpanel-seg"
                role="tablist"
                style={{ '--ssg-seg-count': String(props.tabs.length), '--ssg-seg-index': String(activeIndex()) }}
              >
                <span class="ssg-toolpanel-seg-indicator" aria-hidden="true" />
                <For each={props.tabs} keyed={(descriptor) => descriptor.tab}>
                  {(descriptor) => {
                    const isActive = () => descriptor().tab === props.activeTab;
                    return (
                      <button
                        type="button"
                        role="tab"
                        id={`${tabIdBase}-tab-${descriptor().tab}`}
                        aria-controls={isActive() ? `${tabIdBase}-panel` : undefined}
                        aria-selected={isActive() ? 'true' : 'false'}
                        onClick={() => {
                          if (!isActive()) {
                            props.onSelectTab(descriptor().tab);
                          }
                        }}
                        class={{ 'ssg-toolpanel-seg-btn': true, 'ssg-toolpanel-seg-btn--active': isActive() }}
                      >
                        {descriptor().label}
                        <Show when={descriptor().badge}>
                          {(badge) => <span class="ssg-toolpanel-seg-badge">{badge()}</span>}
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
              <button
                type="button"
                onClick={() => props.onRequestClose()}
                aria-label={texts().close}
                class="ssg-popover-close"
              >
                ×
              </button>
            </div>

            {/* 本体: 開いているタブの中身 */}
            <div
              class="ssg-toolpanel-body"
              role="tabpanel"
              id={`${tabIdBase}-panel`}
              aria-labelledby={`${tabIdBase}-tab-${props.activeTab}`}
            >
              {props.children}
            </div>
          </div>
        </Portal>
      )}
    </Show>
  );
}