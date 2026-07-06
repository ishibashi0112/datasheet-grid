// 追加(バッチ②/コンテキストメニュー): ボディのセル/行に対する完全カスタムメニューの portal 描画です。
//   ライブラリは既定項目を持たず、getContextMenuItems が返した項目配列(action / separator / custom)
//   だけを描画します。外装は列メニューと同じ .ssg-menu-panel / .ssg-menu-item を再利用します
//   (portal 先 = document.body で .ssg-root 外のため、CSS はリテラル色で定義済み)。
import { createPortal } from 'react-dom';
import { cx } from '../logic/cx';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { GridContextMenuItem } from '../model/gridTypes';
import type { CellContextMenuLayout } from '../hooks/useCellContextMenuController';

type CellContextMenuPopoverProps = {
  isOpen: boolean;
  // 追加(TH-DK-2): ダークテーマ修飾子クラス('ssg-theme-dark' | undefined)。ポータルは
  //   .ssg-root 外のため、root と同じ修飾子を自身の root 要素へ直接付与します。
  themeClassName?: string;
  items: GridContextMenuItem[];
  layout: CellContextMenuLayout | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  onRequestClose: () => void;
};

export function CellContextMenuPopover({
  isOpen,
  themeClassName,
  items,
  layout,
  popoverRef,
  onRequestClose,
}: CellContextMenuPopoverProps) {
  if (!isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    width: layout.width,
    zIndex: 1000,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: popover 内 pointer 操作を grid 側へ伝播させません
    //       (列選択開始や outside click 判定との競合を避けます)。
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard を React ツリー parent へ流しません
    //       (Escape での close は controller の window keydown が担当します)。
    // 変更(POP-KEY): capture 相(onKeyDownCapture)→ bubble 相(onKeyDown)へ変更します。
    //   capture 相の stopPropagation() はネイティブ伝播ごと止めるため、パネル内部要素の
    //   bubble 相 onKeyDown や window(bubble)リスナーまで殺してしまいます
    //   (ColumnFilterPopover の SF-ENTER fix と同一パターンの統一です)。bubble 相なら
    //   「内部要素のハンドラが先に処理 → 最後にここで外側への合成バブリングだけ遮断」に
    //   なり、Escape close は controller 側の capture 登録(POP-KEY)が受けます。
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="menu"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        // 追加: メニュー上での右クリックはブラウザ標準メニューを出しません。
        event.preventDefault();
      }}
      className={cx('ssg-menu-panel', themeClassName)}
      style={wrapperStyle}
    >
      {items.map((item, index) => {
        // 区切り線。
        if (item.kind === 'separator') {
          return (
            <div
              key={item.id ?? `sep-${index}`}
              className="ssg-menu-separator"
            />
          );
        }

        // セクション見出し(非インタラクティブ / Menu.Label 相当)。
        if (item.kind === 'label') {
          return (
            <div
              key={item.id ?? `label-${index}`}
              className="ssg-menu-section-label"
              role="presentation"
            >
              {item.label}
            </div>
          );
        }

        // 完全自由描画のエスケープハッチ(レンダラ)。close を渡します。
        if (item.kind === 'custom') {
          return (
            <div key={item.id ?? `custom-${index}`} role="none">
              {item.render({ close: onRequestClose })}
            </div>
          );
        }

        // action(既定: kind 省略 or 'action')。クリックで onSelect 実行後に自動 close。
        //   disabled は native button で click 自体が抑止されます(見た目は --disabled)。
        return (
          <button
            key={item.id ?? `action-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onRequestClose();
            }}
            className={cx(
              'ssg-menu-item',
              item.danger && 'ssg-menu-item--danger',
              item.disabled && 'ssg-menu-item--disabled',
            )}
          >
            {/* 左 14px アイコン枠。未指定でも空スペーサとして他項目とラベル左端を揃えます。 */}
            <span className="ssg-menu-icon">{item.icon}</span>
            <span className="ssg-menu-label">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export default CellContextMenuPopover;