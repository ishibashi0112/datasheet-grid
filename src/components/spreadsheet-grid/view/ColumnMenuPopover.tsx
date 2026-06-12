import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { GridColumnPinned } from '../model/gridTypes';
import type { ColumnMenuLayout } from '../hooks/useColumnMenuController';

// 追加(13-A): 列メニュー(AG Grid の Pin Column サブメニュー相当)の portal popover です。
//             「⋮」ボタン押下 / ヘッダー右クリックのどちらからでも同じメニューが開きます。
//             現状の項目は列固定(左に固定 / 右に固定 / 固定しない)のみですが、
//             将来「列の表示/非表示」「自動幅調整」等を同じメニューへ足せる構成にしています。

type ColumnMenuPinnedItem = {
  // 注記: undefined = 固定なし(中央スクロール領域)です。
  value: GridColumnPinned | undefined;
  label: string;
};

// 追加(13-A): AG Grid の No Pin / Pin Left / Pin Right に対応する 3 項目です。
const PINNED_ITEMS: ColumnMenuPinnedItem[] = [
  { value: 'left', label: '左に固定' },
  { value: 'right', label: '右に固定' },
  { value: undefined, label: '固定しない' },
];

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

const SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  margin: '4px 0 4px',
  userSelect: 'none',
};

// 追加(13-A): メニュー項目ボタンの style です。disabled / 選択中で出し分けます。
const getMenuItemStyle = (disabled: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 8px',
  border: 'none',
  borderRadius: 8,
  backgroundColor: 'transparent',
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
  if (!isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    width: layout.width,
    padding: 8,
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
    zIndex: 1000,
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

      <div style={{ padding: '0 8px' }}>
        <div style={SECTION_LABEL_STYLE}>列の固定</div>
      </div>

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
            style={getMenuItemStyle(!canChangePinned)}
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
