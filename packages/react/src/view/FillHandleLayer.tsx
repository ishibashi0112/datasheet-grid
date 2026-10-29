// 追加(フィルハンドル 1A): フィルハンドルの描画部品です(状態と操作は controllers/fillHandleController)。
//   - FillHandle: 選択範囲の右下の四角(各ペインの overlay 層。座標は選択の塗りと同じペインローカル)。
//   - FillPreviewOverlay: ドラッグ中の「埋める範囲」の点線(元の範囲 + 埋める範囲)。
//   - FillOptionsChip: 埋めたあとに右下へ出すボタン。押すと FillOptionsMenu(連続データ / セルのコピー)を開く。
//   - FillTooltip: ドラッグ中にポインタの近くへ出す「いちばん遠いセルへ入る値」(ポインタ位置だけを購読)。
//   メニューとツールチップは document.body へのポータルです(.ssg-root 外のため portalClassName でテーマを渡す)。
import {
  useEffect,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import type {
  FillHandleController,
  FillMenuLayout,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/fillHandleController';
import type { GridFillKind } from '../model/gridTypes';
import type { SelectionOverlayRect } from '../SelectionOverlay';

// 描画部品が使うコントローラの面(行の型 T に依らない部分だけ)。
type FillUiController = Pick<
  FillHandleController<unknown>,
  | 'toggleMenu'
  | 'closeMenu'
  | 'chooseKind'
  | 'subscribePointer'
  | 'getPointerSnapshot'
>;

type PanePosition = {
  headerHeight: number;
  leadingWidth: number;
  baseOffset: number;
};

// 選択範囲の右下の四角。x / y はペインローカルの角(右下)の座標。
export function FillHandle({
  corner,
  headerHeight,
  leadingWidth,
  baseOffset,
  onPointerDown,
}: PanePosition & {
  corner: { x: number; y: number } | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  if (!corner) {
    return null;
  }
  const style: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + corner.x,
    top: headerHeight + corner.y - baseOffset,
  };
  return (
    <div
      className="ssg-fill-handle"
      style={style}
      data-ssg-fill-handle=""
      aria-hidden="true"
      onPointerDown={onPointerDown}
    />
  );
}

// ドラッグ中の埋める範囲の点線。
export function FillPreviewOverlay({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset,
}: PanePosition & { rect: SelectionOverlayRect }) {
  const style: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + rect.left,
    top: headerHeight + rect.top - baseOffset,
    width: rect.width,
    height: rect.height,
  };
  return <div className="ssg-fill-preview" style={style} data-ssg-fill-preview="" />;
}

// 埋めたあとのボタン。x / y はボタン左上のペインローカル座標。
export function FillOptionsChip({
  position,
  headerHeight,
  leadingWidth,
  baseOffset,
  kind,
  menuOpen,
  chipRef,
  controller,
}: PanePosition & {
  position: { x: number; y: number } | null;
  kind: GridFillKind;
  menuOpen: boolean;
  chipRef: RefObject<HTMLButtonElement | null>;
  controller: FillUiController;
}) {
  if (!position) {
    return null;
  }
  const style: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + position.x,
    top: headerHeight + position.y - baseOffset,
  };
  return (
    <button
      ref={chipRef}
      type="button"
      className={cx('ssg-fill-options', menuOpen && 'ssg-fill-options--open')}
      style={style}
      data-ssg-fill-options=""
      aria-label={kind === 'series' ? 'オートフィル オプション(連続データ)' : 'オートフィル オプション(セルのコピー)'}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      title="オートフィル オプション"
      onPointerDown={(event) => {
        // フォーカスをグリッドに残します(ボタンの祖先にセルは無いため選択は始まらない)。伝播は止めません
        //   (開いている別のポップオーバーの「外側の押下で閉じる」へ届かせる。自分のメニューはボタンを内側とみなす)。
        event.preventDefault();
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        controller.toggleMenu({ left: rect.left, top: rect.top, bottom: rect.bottom });
      }}
    >
      <svg
        viewBox="0 0 16 16"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
        <path d="M6 10.5h7.5M10 7.5l3.5 3-3.5 3" />
      </svg>
      <span className="ssg-fill-options-caret" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

const MENU_ITEMS: { kind: GridFillKind; label: string }[] = [
  { kind: 'series', label: '連続データ' },
  { kind: 'copy', label: 'セルのコピー' },
];

// 連続データ / セルのコピーを選ぶメニュー(ポータル)。開いたら選ばれている項目へフォーカスします。
export function FillOptionsMenu({
  layout,
  kind,
  seriesAvailable,
  themeClassName,
  panelRef,
  controller,
}: {
  layout: FillMenuLayout;
  kind: GridFillKind;
  seriesAvailable: boolean;
  themeClassName?: string;
  panelRef: RefObject<HTMLDivElement | null>;
  controller: FillUiController;
}) {
  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [panelRef]);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') ?? [],
      );
      const index = items.findIndex((item) => item === document.activeElement);
      const next = items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next?.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      controller.closeMenu();
    }
    // ポータル内のキーはグリッドへ流しません(Escape は controller の window keydown が閉じる)。
    event.stopPropagation();
  };
  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label="オートフィル オプション"
      className={cx('ssg-menu-panel', 'ssg-fill-menu', themeClassName)}
      style={{ position: 'fixed', top: layout.top, left: layout.left, zIndex: 1000 }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {MENU_ITEMS.map((item) => {
        const disabled = item.kind === 'series' && !seriesAvailable;
        const checked = item.kind === kind;
        return (
          <button
            key={item.kind}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            disabled={disabled}
            className={cx('ssg-menu-item', checked && 'ssg-menu-item--active', disabled && 'ssg-menu-item--disabled')}
            onClick={() => controller.chooseKind(item.kind)}
          >
            <span className="ssg-menu-icon ssg-fill-menu-check">{checked ? '✓' : ''}</span>
            <span className="ssg-menu-label">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = 18;

// ドラッグ中の値のツールチップ(ポータル)。ポインタ位置だけを購読します(シェルは再描画しない)。
export function FillTooltip({
  text,
  themeClassName,
  controller,
}: {
  text: string;
  themeClassName?: string;
  controller: FillUiController;
}) {
  const pointer = useSyncExternalStore(
    controller.subscribePointer,
    controller.getPointerSnapshot,
    controller.getPointerSnapshot,
  );
  if (!pointer) {
    return null;
  }
  return createPortal(
    <div
      className={cx('ssg-tooltip', 'ssg-tooltip--visible', 'ssg-fill-tooltip', themeClassName)}
      style={{ left: pointer.x + TOOLTIP_OFFSET_X, top: pointer.y + TOOLTIP_OFFSET_Y }}
      aria-hidden="true"
      data-ssg-fill-tooltip=""
    >
      {text}
    </div>,
    document.body,
  );
}