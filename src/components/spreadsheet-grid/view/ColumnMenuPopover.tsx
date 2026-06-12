// 変更(13-A2): フラットな項目列挙 → AG Grid 同様のカスケード(サブメニュー)UI へ変更します。
//             ルートメニューには「列の固定 ›」を置き、hover / クリックで右隣に
//             サブメニュー(固定しない / 左に固定 / 右に固定)を開きます。
//             将来「この列の幅を自動調整」「列の表示/非表示」等のルート項目を
//             追加しても、同じ MenuRow / サブメニューパターンで拡張できる構成です。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { GridColumnPinned } from '../model/gridTypes';
import type { ColumnMenuLayout } from '../hooks/useColumnMenuController';

type ColumnMenuPinnedItem = {
  // 注記: undefined = 固定なし(中央スクロール領域)です。
  value: GridColumnPinned | undefined;
  label: string;
};

// 変更(13-A2): 項目順を AG Grid の Pin Column サブメニュー
//             (No Pin / Pin Left / Pin Right)に合わせます。
const PINNED_ITEMS: ColumnMenuPinnedItem[] = [
  { value: undefined, label: '固定しない' },
  { value: 'left', label: '左に固定' },
  { value: 'right', label: '右に固定' },
];

// 追加(13-A2): サブメニューの幅と、ルートメニューとの水平間隔です。
//             左右どちらへ開くかの判定(viewport はみ出し)にも使います。
const SUBMENU_WIDTH = 180;
const SUBMENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

type ColumnMenuPopoverProps = {
  isOpen: boolean;
  title: string;
  columnKey: string;
  // 追加: 開いている列の現在の固定状態です(✓ 表示に使います)。
  pinned: GridColumnPinned | undefined;
  // 追加: onColumnsChange 未指定時は false になり、固定切替の項目を無効化します
  //       (columns は controlled props のため、callback なしでは反映できません)。
  canChangePinned: boolean;
  layout: ColumnMenuLayout | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  onPinnedChange: (
    columnKey: string,
    pinned: GridColumnPinned | undefined,
  ) => void;
  onRequestClose: () => void;
};

// 追加(13-A2): ルートメニュー / サブメニューで共有するパネルの見た目です。
const PANEL_BASE_STYLE: CSSProperties = {
  padding: 8,
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  backgroundColor: '#ffffff',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
};

// 追加(13-A): メニュー項目ボタンの style です。disabled / hover(highlight) で出し分けます。
const getMenuItemStyle = (
  disabled: boolean,
  highlighted: boolean,
): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 8px',
  border: 'none',
  borderRadius: 8,
  backgroundColor: highlighted ? '#f1f5f9' : 'transparent',
  color: disabled ? '#94a3b8' : '#334155',
  fontSize: 13,
  textAlign: 'left',
  cursor: disabled ? 'default' : 'pointer',
});

export function ColumnMenuPopover({
  isOpen,
  title,
  columnKey,
  pinned,
  canChangePinned,
  layout,
  popoverRef,
  onPinnedChange,
  onRequestClose,
}: ColumnMenuPopoverProps) {
  // 追加(13-A2): 「列の固定」サブメニューの開閉状態です(popover ローカル)。
  // 注記: AG Grid と同様、一度開いたサブメニューはポインタが離れても開いたままにし、
  //       別のルート項目へ hover したとき(将来項目が増えた場合)・メニュー自体が
  //       閉じたときに閉じます。チラつき防止のため pointerleave では閉じません。
  const [isPinSubmenuOpen, setIsPinSubmenuOpen] = useState(false);

  // 追加(13-A2): 開いたまま別列へ切り替えた場合(popover は mount されたまま
  //             columnKey だけ変わる)に、サブメニューの開閉状態を初期化します。
  useEffect(() => {
    setIsPinSubmenuOpen(false);
  }, [columnKey, isOpen]);

  if (!isOpen || !layout) {
    return null;
  }

  // 追加(13-A2): サブメニューを右に開くと viewport をはみ出す場合は左へ開きます
  //             (AG Grid と同じフリップ挙動です)。layout はルートメニューの
  //             fixed 座標なので、右端 = layout.left + layout.width です。
  const submenuOpensLeft =
    layout.left + layout.width + SUBMENU_GAP + SUBMENU_WIDTH >
    window.innerWidth - VIEWPORT_MARGIN;

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    width: layout.width,
    ...PANEL_BASE_STYLE,
    zIndex: 1000,
  };

  // 追加(13-A2): サブメニューはルート項目(position: relative の行)を基準に
  //             絶対配置します。top: -9 はパネルの padding(8) + border(1) ぶんを
  //             相殺し、サブメニューの先頭項目をルート項目と上端揃えにするためです。
  const submenuStyle: CSSProperties = {
    position: 'absolute',
    top: -9,
    ...(submenuOpensLeft
      ? { right: `calc(100% + ${SUBMENU_GAP}px)` }
      : { left: `calc(100% + ${SUBMENU_GAP}px)` }),
    width: SUBMENU_WIDTH,
    ...PANEL_BASE_STYLE,
    zIndex: 1,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: popover 内 pointer 操作を grid 側へ伝播させません
    //       (列選択開始や outside click 判定との競合を避けます)。
    event.stopPropagation();
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard イベントを React ツリー上の parent へ流しません。
    //       Escape での close は controller の window keydown リスナーが担当します。
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={popoverRef}
      onPointerDown={handlePointerDown}
      onKeyDownCapture={handleKeyDownCapture}
      onContextMenu={(event) => {
        // 追加: メニュー上での右クリックはブラウザ標準メニューを出しません。
        event.preventDefault();
      }}
      style={wrapperStyle}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#334155',
          padding: '2px 8px 6px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 4,
          userSelect: 'none',
        }}
      >
        {title}
      </div>

      {/* ── ルート項目: 列の固定 ›(サブメニュー親) ── */}
      {/* 追加(13-A2): サブメニューはこの行(position: relative)基準で絶対配置します。
          パネル自体は overflow を持たないため、wrapper の外側(右隣 / 左隣)へ
          はみ出して表示されます。popoverRef(wrapper)の子孫なので、controller の
          outside-pointerdown 判定(contains)にもそのまま含まれます。 */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onPointerEnter={() => {
            // 追加(13-A2): AG Grid と同様、hover でサブメニューを開きます。
            setIsPinSubmenuOpen(true);
          }}
          onClick={() => {
            // 追加(13-A2): クリックでもトグルできるようにします(タッチ環境向け)。
            setIsPinSubmenuOpen((current) => !current);
          }}
          style={getMenuItemStyle(false, isPinSubmenuOpen)}
        >
          {/* 注記: ✓ 列との左端揃えのため、サブメニュー項目と同じ幅のスペーサを置きます。*/}
          <span style={{ width: 14, flex: '0 0 auto' }} />
          <span style={{ minWidth: 0, flex: 1 }}>列の固定</span>
          <span
            style={{
              flex: '0 0 auto',
              color: '#94a3b8',
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ›
          </span>
        </button>

        {/* ── サブメニュー: 固定しない / 左に固定 / 右に固定 ── */}
        {isPinSubmenuOpen && (
          <div style={submenuStyle}>
            {PINNED_ITEMS.map((item) => {
              const isSelected = pinned === item.value;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!canChangePinned}
                  onClick={() => {
                    if (!canChangePinned) {
                      return;
                    }
                    // 注記: 現在値と同じ項目を選んでも閉じるだけになります
                    //       (no-op 判定は SpreadsheetGrid 側で行います)。
                    onPinnedChange(columnKey, item.value);
                  }}
                  onPointerEnter={(event) => {
                    if (canChangePinned) {
                      event.currentTarget.style.backgroundColor = '#f1f5f9';
                    }
                  }}
                  onPointerLeave={(event) => {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  style={getMenuItemStyle(!canChangePinned, false)}
                >
                  {/* 追加: 現在の固定状態に ✓ を出します(未選択は幅だけ確保して揃えます)。*/}
                  <span
                    style={{
                      width: 14,
                      flex: '0 0 auto',
                      color: '#2563eb',
                      fontWeight: 700,
                      visibility: isSelected ? 'visible' : 'hidden',
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>{item.label}</span>
                </button>
              );
            })}

            {!canChangePinned && (
              <div
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  padding: '4px 8px 2px',
                  userSelect: 'none',
                }}
              >
                onColumnsChange 未指定のため固定状態を変更できません
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          marginTop: 4,
          paddingTop: 6,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={onRequestClose}
          style={{
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#475569',
            borderRadius: 8,
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default ColumnMenuPopover;
