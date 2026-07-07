// 追加(UP-1 / 統合ツールパネル): フィルター管理 / 列の表示 / 並び替えを 1 枚に統合した
//   フローティングパネルのシェルです(portal で body 直下へ出します)。
//   - ヘッダー: SegmentedControl(タブ切替 + 件数バッジ)+ × クローズ。ヘッダーを掴んで
//     パネルを移動できます(usePanelHeaderDrag / 旧 3 パネルの FM-4 挙動を継承)。
//   - ボディ: アクティブタブのコンテンツ(children)を描画します。コンテンツは
//     FilterManagementPanel / ColumnChooserPanel / SortManagementPanel(UP-1 でコンテンツ化)
//     を呼び出し側(SpreadsheetGrid)がタブに応じて選んで渡します。タブ切替でコンテンツは
//     マウントし直され、タブ内の一時状態(検索語など)はリセットされます(旧パネルの
//     「閉じたらリセット」と同じ整理)。
//   - SegmentedControl は Mantine 風のスライドインジケータです。セグメントは等幅のため、
//     インジケータは CSS 変数(--ssg-seg-count / --ssg-seg-index)による translateX だけで
//     追従し、実測(offsetWidth)を使いません(resize / タブ数変化に自動追従)。
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../logic/cx';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react';
import type {
  ToolPanelLayout,
  ToolPanelTab,
} from '../hooks/useToolPanelController';
// ヘッダーを掴んでパネルを移動する共有フックです(FM-4)。
import { usePanelHeaderDrag } from '../hooks/usePanelHeaderDrag';

// 追加(UP-1): SegmentedControl の 1 セグメント分の表示情報です。
//   badge は件数バッジ(適用中フィルター数 / ソート基準数)。undefined / 0 は非表示です。
export type ToolPanelTabDescriptor = {
  tab: ToolPanelTab;
  label: string;
  badge?: number;
};

type ToolPanelProps = {
  // 追加(TH-DK-2): ダークテーマ修飾子クラス('ssg-theme-dark' | undefined)。ポータルは
  //   .ssg-root 外のため、root と同じ修飾子を自身の root 要素へ直接付与します。
  themeClassName?: string;
  // アクティブタブです(null = closed。描画しません)。
  activeTab: ToolPanelTab | null;
  // 追加(UP-2): 既開時フラッシュのトリガーです(controller の toolPanelFlashTick)。
  //   値が増えるたびにパネル枠を一瞬フラッシュします(閉→開では増えないため光りません)。
  flashTick: number;
  // 表示順どおりの可用タブです(controller の availableToolPanelTabs から作ります)。
  tabs: ToolPanelTabDescriptor[];
  layout: ToolPanelLayout | null;
  panelRef: RefObject<HTMLDivElement | null>;
  onSelectTab: (tab: ToolPanelTab) => void;
  onRequestClose: () => void;
  // ヘッダードラッグによるパネル移動です(controller の moveToolPanel を受け取ります。
  // 位置の clamp・保持・close 時リセットは controller 側の責務)。
  onPanelMove: (top: number, left: number) => void;
  // アクティブタブのコンテンツです(呼び出し側がタブに応じて選んで渡します)。
  children: ReactNode;
};

export function ToolPanel({
  themeClassName,
  activeTab,
  flashTick,
  tabs,
  layout,
  panelRef,
  onSelectTab,
  onRequestClose,
  onPanelMove,
  children,
}: ToolPanelProps) {
  // hooks は早期 return より前・無条件で呼びます(layout=null のときはフック側が開始しません)。
  const { handleHeaderPointerDown } = usePanelHeaderDrag({
    layout,
    onPanelMove,
  });

  // 追加(UP-2 / 既開時フラッシュ): flashTick が増えたら panelRef の枠を一瞬フラッシュします。
  //   既存のヘッダージャンプ(ssg-header-cell--jump-flash)と同じ「JS 直付け + animationend
  //   除去」方式です。className prop には載せません(React の再レンダーでクラスが消えると
  //   アニメが途中で止まるため。直付けなら animationend まで残ります)。初回(tick=0 → mount)は
  //   effect が走りますが、閉→開では controller が increment しないため通常は光りません。
  //   一度付いているクラスは先に除去してから付け直し、連打でも再生させます(reflow を挟む)。
  useEffect(() => {
    const el = panelRef.current;
    if (!el || flashTick === 0) {
      return;
    }
    el.classList.remove('ssg-toolpanel--flash');
    // 強制 reflow でアニメを確実に再スタートさせます(連続クリック対策)。
    void el.offsetWidth;
    el.classList.add('ssg-toolpanel--flash');
    const handleEnd = () => {
      el.classList.remove('ssg-toolpanel--flash');
    };
    el.addEventListener('animationend', handleEnd);
    return () => {
      el.removeEventListener('animationend', handleEnd);
    };
  }, [flashTick, panelRef]);

  if (activeTab === null || !layout) {
    return null;
  }

  const activeIndex = Math.max(
    0,
    tabs.findIndex((descriptor) => descriptor.tab === activeTab),
  );

  const wrapperStyle: CSSProperties = {
    top: layout.top,
    left: layout.left,
    width: layout.width,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // パネル内 pointer 操作を grid 側へ伝播させません(セル選択開始 / outside click 競合回避)。
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // portal 内 keyboard を React ツリー上の parent へ流しません。
    // Escape での close は controller の window keydown(capture / POP-KEY)が担当します。
    event.stopPropagation();
  };

  // SegmentedControl のインジケータ位置です(等幅前提の CSS 変数駆動)。
  const segmentedStyle = {
    '--ssg-seg-count': tabs.length,
    '--ssg-seg-index': activeIndex,
  } as CSSProperties;

  return createPortal(
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className={cx('ssg-popover', 'ssg-toolpanel', themeClassName)}
      style={wrapperStyle}
    >
      {/* ── ヘッダー: SegmentedControl + × クローズ(掴んで移動可) ── */}
      <div
        className="ssg-toolpanel-header ssg-popover-header--draggable"
        onPointerDown={handleHeaderPointerDown}
      >
        <div className="ssg-toolpanel-seg" role="tablist" style={segmentedStyle}>
          <span className="ssg-toolpanel-seg-indicator" aria-hidden />
          {tabs.map((descriptor) => {
            const isActive = descriptor.tab === activeTab;
            return (
              <button
                key={descriptor.tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (!isActive) {
                    onSelectTab(descriptor.tab);
                  }
                }}
                className={cx(
                  'ssg-toolpanel-seg-btn',
                  isActive && 'ssg-toolpanel-seg-btn--active',
                )}
              >
                {descriptor.label}
                {descriptor.badge ? (
                  <span className="ssg-toolpanel-seg-badge">
                    {descriptor.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="閉じる"
          className="ssg-popover-close"
        >
          ×
        </button>
      </div>

      {/* ── ボディ: アクティブタブのコンテンツ ── */}
      {/* min-height でタブ間の高さのガタつきを緩和しつつ、内容が短いタブでは各コンテンツの
          リスト(flex: 1)が伸びてフッターが下端に揃います(自然高 + min-height 方式)。 */}
      <div className="ssg-toolpanel-body">{children}</div>
    </div>,
    document.body,
  );
}

export default ToolPanel;