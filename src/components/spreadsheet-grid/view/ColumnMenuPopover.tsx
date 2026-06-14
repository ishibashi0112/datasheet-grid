// 変更(13-A2): フラットな項目列挙 → AG Grid 同様のカスケード(サブメニュー)UI へ変更します。
//             ルートメニューには「列の固定 ›」を置き、hover / クリックで右隣に
//             サブメニュー(固定しない / 左に固定 / 右に固定)を開きます。
// 変更(13-B1): 13-A2 セッションの設計決定どおり、サブメニュー開閉状態を
//             isPinSubmenuOpen: boolean → openSubmenuKey: string | null へ一般化し、
//             ルート項目に「この列の幅を自動調整」「すべての列の幅を自動調整」を
//             追加します(AG Grid の Autosize This Column / Autosize All Columns 相当)。
//             サブメニューを持たないルート項目への hover で openSubmenuKey を null に
//             戻すことで、AG Grid の「別項目 hover でカスケードが閉じる」挙動になります。
// 変更(13-B2-1): ルート項目「列の表示」を追加します(AG Grid の Choose Columns 相当)。
//             サブメニューではなく別 popover(ColumnChooserPanel)を開くリーフ項目です。
// 追加(13-B2-3 / gpt5.5対応): ルート項目「列のリセット」を追加します。
//             既存の ColumnChooserPanel フッターと同じ reset 処理を呼び出し、列メニュー側からも
//             AG Grid の Reset Columns 相当を実行できるようにします。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { GridColumnPinned, GridSortDirection } from '../model/gridTypes';
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

// 追加(13-B1): サブメニューを持つルート項目の識別キーです。
//             openSubmenuKey(string | null) との比較で開閉を判定します。
//             13-B 後続でサブメニュー持ち項目を増やす場合はキーを追加します。
const PIN_SUBMENU_KEY = 'pin';

type ColumnMenuPopoverProps = {
  isOpen: boolean;
  title: string;
  columnKey: string;
  // 追加(13-B4): ソート(昇順/降順)をメニューから操作するための状態とハンドラです。
  //             canSort=false(enableSorting=false 相当)のときは項目自体を出しません
  //             (AG Grid の sortable:false でソート項目が消えるのと同じ挙動です)。
  //             sortDirection はこの列の現在のソート方向で、✓ 表示の単一ソースです。
  //             同じ方向を再選択したときの「解除」判定は SpreadsheetGrid 側が行います。
  canSort: boolean;
  sortDirection: GridSortDirection;
  onSortChange: (direction: Exclude<GridSortDirection, null>) => void;
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
  // 追加(13-B1): 幅自動調整のハンドラです。幅は grid 内部 state(columnWidths)で
  //             管理されるため、pinned と違い onColumnsChange の有無に依存せず
  //             常に有効です(手動リサイズと同じ扱い)。
  onAutosizeColumn: (columnKey: string) => void;
  onAutosizeAllColumns: () => void;
  // 追加(13-B2-1): 列の表示/非表示パネル(ColumnChooserPanel)を開くハンドラです。
  //             この項目はサブメニューではなく別 popover を開くリーフ項目です
  //             (クリックで列メニューを閉じてパネルを開きます。配線は SpreadsheetGrid 側)。
  onOpenColumnChooser: () => void;
  // 追加(13-B2-3 / gpt5.5対応): 列メニュー root の「列のリセット」用です。
  //             columns は controlled props のため、onColumnsChange 未指定時は無効化します。
  canResetColumns: boolean;
  onResetColumns: () => void;
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
  canSort,
  sortDirection,
  onSortChange,
  pinned,
  canChangePinned,
  layout,
  popoverRef,
  onPinnedChange,
  onAutosizeColumn,
  onAutosizeAllColumns,
  onOpenColumnChooser,
  canResetColumns,
  onResetColumns,
  onRequestClose,
}: ColumnMenuPopoverProps) {
  // 変更(13-B1): isPinSubmenuOpen: boolean → openSubmenuKey: string | null へ一般化します
  //             (13-A2 セッションの設計決定どおり)。
  //   - サブメニューを持つルート項目: onPointerEnter で setOpenSubmenuKey(自分の key)
  //   - サブメニューを持たないルート項目: onPointerEnter で setOpenSubmenuKey(null)
  //     (= 開いているカスケードが閉じる。AG Grid の挙動の肝)
  // 注記: AG Grid と同様、一度開いたサブメニューはポインタが離れても開いたままにし、
  //       別のルート項目へ hover したとき・メニュー自体が閉じたときに閉じます。
  //       チラつき防止のため pointerleave では閉じません。
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null);

  // 追加(13-A2): 開いたまま別列へ切り替えた場合(popover は mount されたまま
  //             columnKey だけ変わる)に、サブメニューの開閉状態を初期化します。
  // 変更(13-B1): リセット先を openSubmenuKey = null に読み替えます。
  useEffect(() => {
    setOpenSubmenuKey(null);
  }, [columnKey, isOpen]);

  if (!isOpen || !layout) {
    return null;
  }

  const isPinSubmenuOpen = openSubmenuKey === PIN_SUBMENU_KEY;

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

      {/* ── ルート項目: 昇順 / 降順で並び替え(13-B4) ── */}
      {/* 追加(13-B4): ヘッダーのソートボタンを廃止し、ソート操作をメニュー(と
          コンテキストメニュー)へ集約します。AG Grid の Sort Ascending /
          Sort Descending 相当のリーフ項目です。現在の方向に ✓ を出し、その方向を
          もう一度選ぶと解除します(解除判定は SpreadsheetGrid 側)。
          サブメニューを持たないリーフなので、hover で openSubmenuKey を null に戻し、
          開いているカスケード(列の固定)を閉じます。hover ハイライトは他のリーフと
          同じ DOM 直接書き換え方式です(state hover を避け、memo 影響を出しません)。 */}
      {canSort && (
        <>
          <button
            type="button"
            onPointerEnter={(event) => {
              setOpenSubmenuKey(null);
              event.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onPointerLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onSortChange('asc');
            }}
            style={getMenuItemStyle(false, false)}
          >
            {/* 注記: 14px 列は他項目の ✓ 列と左端を揃えます。
                未適用時は方向アイコン(↑/↓)を、適用中は ✓ を出します。
                ラベル自体が方向を示すため、適用中にアイコンが ✓ へ変わっても
                意味は失われません。 */}
            <span
              style={{
                width: 14,
                flex: '0 0 auto',
                textAlign: 'center',
                color: sortDirection === 'asc' ? '#2563eb' : '#94a3b8',
                fontWeight: sortDirection === 'asc' ? 700 : 400,
              }}
            >
              {sortDirection === 'asc' ? '✓' : '↑'}
            </span>
            <span
              style={{
                minWidth: 0,
                flex: 1,
                color: sortDirection === 'asc' ? '#1d4ed8' : undefined,
              }}
            >
              昇順で並び替え
            </span>
          </button>

          <button
            type="button"
            onPointerEnter={(event) => {
              setOpenSubmenuKey(null);
              event.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onPointerLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onSortChange('desc');
            }}
            style={getMenuItemStyle(false, false)}
          >
            <span
              style={{
                width: 14,
                flex: '0 0 auto',
                textAlign: 'center',
                color: sortDirection === 'desc' ? '#2563eb' : '#94a3b8',
                fontWeight: sortDirection === 'desc' ? 700 : 400,
              }}
            >
              {sortDirection === 'desc' ? '✓' : '↓'}
            </span>
            <span
              style={{
                minWidth: 0,
                flex: 1,
                color: sortDirection === 'desc' ? '#1d4ed8' : undefined,
              }}
            >
              降順で並び替え
            </span>
          </button>

          {/* 追加(13-B4): ソート群と以降(固定/幅/表示)の区切りです。 */}
          <div
            style={{
              borderTop: '1px solid #e2e8f0',
              margin: '4px 0',
            }}
          />
        </>
      )}

      {/* ── ルート項目: 列の固定 ›(サブメニュー親) ── */}
      {/* 追加(13-A2): サブメニューはこの行(position: relative)基準で絶対配置します。
          パネル自体は overflow を持たないため、wrapper の外側(右隣 / 左隣)へ
          はみ出して表示されます。popoverRef(wrapper)の子孫なので、controller の
          outside-pointerdown 判定(contains)にもそのまま含まれます。 */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onPointerEnter={() => {
            // 変更(13-B1): AG Grid と同様、hover でこの項目のサブメニューを開きます
            //             (他のサブメニューが開いていれば置き換わります)。
            setOpenSubmenuKey(PIN_SUBMENU_KEY);
          }}
          onClick={() => {
            // 変更(13-B1): クリックでもトグルできるようにします(タッチ環境向け)。
            setOpenSubmenuKey((current) =>
              current === PIN_SUBMENU_KEY ? null : PIN_SUBMENU_KEY,
            );
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

      {/* ── ルート項目: 幅の自動調整(13-B1) ── */}
      {/* 追加(13-B1): サブメニューを持たないルート項目です。hover で
          setOpenSubmenuKey(null) し、開いているカスケード(列の固定)を閉じます
          (AG Grid の「別項目 hover でサブメニューが閉じる」挙動)。
          hover ハイライトはサブメニュー項目と同じ DOM 直接書き換え方式です
          (state を使うと hover のたびに popover 全体が再レンダーされるため)。
          実際の close と幅反映は SpreadsheetGrid 側ハンドラが行います。 */}
      <button
        type="button"
        onPointerEnter={(event) => {
          setOpenSubmenuKey(null);
          event.currentTarget.style.backgroundColor = '#f1f5f9';
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'transparent';
        }}
        onClick={() => {
          onAutosizeColumn(columnKey);
        }}
        style={getMenuItemStyle(false, false)}
      >
        {/* 注記: ✓ 列との左端揃え用スペーサです(ピン行と同じ幅)。*/}
        <span style={{ width: 14, flex: '0 0 auto' }} />
        <span style={{ minWidth: 0, flex: 1 }}>この列の幅を自動調整</span>
      </button>

      <button
        type="button"
        onPointerEnter={(event) => {
          setOpenSubmenuKey(null);
          event.currentTarget.style.backgroundColor = '#f1f5f9';
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'transparent';
        }}
        onClick={() => {
          onAutosizeAllColumns();
        }}
        style={getMenuItemStyle(false, false)}
      >
        <span style={{ width: 14, flex: '0 0 auto' }} />
        <span style={{ minWidth: 0, flex: 1 }}>すべての列の幅を自動調整</span>
      </button>

      {/* ── ルート項目: 列の表示(13-B2-1) ── */}
      {/* 追加(13-B2-1): サブメニューではなく別 popover(ColumnChooserPanel)を開く
          リーフ項目です。autosize 項目と同じく hover で setOpenSubmenuKey(null) し、
          開いているカスケード(列の固定)を閉じます。クリックで列メニューを閉じて
          パネルを開く処理は SpreadsheetGrid 側(onOpenColumnChooser)が担います。 */}
      <button
        type="button"
        onPointerEnter={(event) => {
          setOpenSubmenuKey(null);
          event.currentTarget.style.backgroundColor = '#f1f5f9';
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'transparent';
        }}
        onClick={() => {
          onOpenColumnChooser();
        }}
        style={getMenuItemStyle(false, false)}
      >
        <span style={{ width: 14, flex: '0 0 auto' }} />
        <span style={{ minWidth: 0, flex: 1 }}>列の表示</span>
      </button>

      {/* ── ルート項目: 列のリセット(13-B2-3 / gpt5.5対応) ── */}
      {/* 追加(13-B2-3 / gpt5.5対応): 既存の ColumnChooserPanel フッターと同じ
          リセット処理を列メニュー root からも呼べるようにします。サブメニューではない
          リーフ項目なので、hover 時は openSubmenuKey を null に戻します。 */}
      <button
        type="button"
        aria-disabled={!canResetColumns}
        tabIndex={canResetColumns ? 0 : -1}
        title={
          canResetColumns
            ? 'すべての列の幅・固定・表示を初期状態に戻します'
            : 'onColumnsChange 未指定のため列をリセットできません'
        }
        onPointerEnter={(event) => {
          setOpenSubmenuKey(null);
          if (canResetColumns) {
            event.currentTarget.style.backgroundColor = '#f1f5f9';
          }
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'transparent';
        }}
        onClick={() => {
          if (!canResetColumns) {
            return;
          }
          onResetColumns();
        }}
        style={getMenuItemStyle(!canResetColumns, false)}
      >
        <span style={{ width: 14, flex: '0 0 auto' }} />
        <span style={{ minWidth: 0, flex: 1 }}>列のリセット</span>
      </button>

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