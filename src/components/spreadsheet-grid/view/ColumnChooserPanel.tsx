// 追加(13-B2-1): 列の表示/非表示パネル(AG Grid の Columns Tool Panel 相当)です。
//   - タイトル + × クローズ / 検索ボックス / 3 状態の全選択チェックボックス /
//     列ごとのチェックボックス一覧(チェックで即 表示/非表示)で構成します。
//   - ドラッグ並べ替え(⠿ ハンドル)は別機能のため本バッチでは出しません(13-B3 で対応)。
//   - 本コンポーネントは非ジェネリックです(ColumnMenuPopover と同様、プリミティブな
//     items だけを受け取ります)。一覧は「全列(非表示列を含む)」を渡す必要があるため、
//     呼び出し側は visibleColumns ではなく columns から items を作ります。
// 変更(13-B2-2): フッターに「すべての列を初期状態に戻す」ボタンを追加します
//   (AG Grid の Columns Tool Panel 末尾 "Reset Columns" 相当)。幅 / 固定 / 表示を
//   初期 column defs へ戻す操作で、ロジックは呼び出し側(onResetColumns)が持ちます。
//   canToggle(= onColumnsChange 指定あり)が false のときは無効化します。
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';
import type { ColumnChooserLayout } from '../hooks/useColumnChooserController';
// import type { ColumnChooserLayout } from '../hooks/useColumnChooserController';

// 追加(13-B2-1): パネルが必要とする最小の列情報です。
export type ColumnChooserItem = {
  key: string;
  title: string;
  visible: boolean;
};

type ColumnChooserPanelProps = {
  isOpen: boolean;
  items: ColumnChooserItem[];
  // 追加: onColumnsChange 未指定時は false。チェックボックスを無効化し注記を出します。
  canToggle: boolean;
  layout: ColumnChooserLayout | null;
  panelRef: RefObject<HTMLDivElement | null>;
  onToggleColumnVisibility: (columnKey: string, nextVisible: boolean) => void;
  // 追加: 全選択(= すべて表示)。最後の 1 列ガードのため「全消し」はサポートしません。
  onShowAllColumns: () => void;
  // 追加(13-B2-2): 全列を初期状態(幅 / 固定 / 表示)へ戻します。
  //   ロジックは呼び出し側。canToggle が false のときフッターのボタンは無効化されます。
  onResetColumns: () => void;
  onRequestClose: () => void;
};

const PANEL_MAX_HEIGHT = 420;

const PANEL_STYLE: CSSProperties = {
  position: 'fixed',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: PANEL_MAX_HEIGHT,
  padding: 12,
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  backgroundColor: '#ffffff',
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
  zIndex: 1000,
};

type CheckState = 'checked' | 'unchecked' | 'indeterminate';

// 追加(13-B2-1): 3 状態に対応した自作チェックボックスです。
//   native input の indeterminate は ref 経由でしか設定できず、角丸の見た目も
//   ブラウザ差が出るため、見た目は div で描画します(GIF の角丸チェックに寄せます)。
function CheckBox({
  state,
  disabled,
}: {
  state: CheckState;
  disabled: boolean;
}) {
  const filled = state === 'checked' || state === 'indeterminate';
  const boxStyle: CSSProperties = {
    width: 18,
    height: 18,
    flex: '0 0 auto',
    borderRadius: 5,
    border: `1.5px solid ${
      disabled ? '#cbd5e1' : filled ? '#2563eb' : '#94a3b8'
    }`,
    backgroundColor: disabled
      ? '#f1f5f9'
      : filled
        ? '#2563eb'
        : '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 80ms ease, border-color 80ms ease',
  };

  return (
    <span style={boxStyle} aria-hidden>
      {state === 'checked' && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 4.7 8.4 9.5 3.6"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {state === 'indeterminate' && (
        <span
          style={{
            width: 9,
            height: 2,
            borderRadius: 1,
            backgroundColor: '#ffffff',
          }}
        />
      )}
    </span>
  );
}

export function ColumnChooserPanel({
  isOpen,
  items,
  canToggle,
  layout,
  panelRef,
  onToggleColumnVisibility,
  onShowAllColumns,
  onResetColumns,
  onRequestClose,
}: ColumnChooserPanelProps) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 追加: 開くたびに検索語をリセットし、検索入力へフォーカスします。
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      // portal mount 後にフォーカスを当てます。
      const id = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [isOpen]);

  // 注記: master / guard の判定は「全列(検索フィルタ前)」を基準にします。
  //       検索はあくまで一覧の絞り込み表示で、全選択の意味は変えません。
  const visibleCount = useMemo(
    () => items.filter((item) => item.visible).length,
    [items],
  );
  const allVisible = visibleCount === items.length && items.length > 0;
//   const hasHidden = items.some((item) => !item.visible);

  // 全選択の状態: 全表示 = checked、一部非表示 = indeterminate。
  // 最後の 1 列ガードにより「全非表示」は発生しないため unchecked にはなりません。
  const masterState: CheckState = allVisible ? 'checked' : 'indeterminate';

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, query]);

  if (!isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    ...PANEL_STYLE,
    top: layout.top,
    left: layout.left,
    width: layout.width,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: パネル内 pointer 操作を grid 側へ伝播させません
    //       (列選択開始や outside click 判定との競合を避けます)。
    event.stopPropagation();
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard を React ツリー上の parent へ流しません。
    //       Escape での close は controller の window keydown が担当します。
    event.stopPropagation();
  };

  const handleMasterClick = () => {
    if (!canToggle) {
      return;
    }
    // 全表示状態では何もしません(全消しは最後の 1 列ガードで不可のため)。
    if (!allVisible) {
      onShowAllColumns();
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onKeyDownCapture={handleKeyDownCapture}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      style={wrapperStyle}
    >
      {/* ── ヘッダー: タイトル + × ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingBottom: 8,
          marginBottom: 8,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#1e293b',
            userSelect: 'none',
          }}
        >
          列の表示
        </span>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="閉じる"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            borderRadius: 6,
            backgroundColor: 'transparent',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
          onPointerEnter={(event) => {
            event.currentTarget.style.backgroundColor = '#f1f5f9';
          }}
          onPointerLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ×
        </button>
      </div>

      {/* ── 検索行: 全選択チェック + 検索入力 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          disabled={!canToggle}
          onClick={handleMasterClick}
          aria-label="すべての列を表示"
          title="すべての列を表示"
          style={{
            display: 'flex',
            alignItems: 'center',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: canToggle ? 'pointer' : 'default',
          }}
        >
          <CheckBox state={masterState} disabled={!canToggle} />
        </button>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: 13,
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            ⌕
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="検索..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 10px 7px 26px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 13,
              color: '#334155',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* ── 列一覧(スクロール) ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          margin: '0 -4px',
          padding: '0 4px',
        }}
      >
        {filteredItems.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: '#94a3b8',
              padding: '10px 4px',
              userSelect: 'none',
            }}
          >
            該当する列がありません
          </div>
        ) : (
          filteredItems.map((item) => {
            // 最後の 1 列ガード: 表示中が 1 列だけのとき、その列はチェックを外せません。
            const isOnlyVisible = item.visible && visibleCount === 1;
            const disabled = !canToggle || isOnlyVisible;
            return (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  onToggleColumnVisibility(item.key, !item.visible);
                }}
                onPointerEnter={(event) => {
                  if (!disabled) {
                    event.currentTarget.style.backgroundColor = '#f1f5f9';
                  }
                }}
                onPointerLeave={(event) => {
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '7px 8px',
                  border: 'none',
                  borderRadius: 8,
                  backgroundColor: 'transparent',
                  cursor: disabled ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <CheckBox
                  state={item.visible ? 'checked' : 'unchecked'}
                  disabled={disabled}
                />
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    fontSize: 13,
                    color: disabled && !item.visible ? '#94a3b8' : '#334155',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.title}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* ── フッター: 列のリセット + (無効時)注記 ── */}
      <div
        style={{
          paddingTop: 8,
          marginTop: 8,
          borderTop: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          disabled={!canToggle}
          onClick={() => {
            if (!canToggle) {
              return;
            }
            onResetColumns();
          }}
          title="すべての列の幅・固定・表示を初期状態に戻します"
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '7px 8px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            backgroundColor: 'transparent',
            color: canToggle ? '#334155' : '#cbd5e1',
            cursor: canToggle ? 'pointer' : 'default',
            fontSize: 13,
            textAlign: 'center',
            userSelect: 'none',
          }}
          onPointerEnter={(event) => {
            if (canToggle) {
              event.currentTarget.style.backgroundColor = '#f1f5f9';
            }
          }}
          onPointerLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          すべての列を初期状態に戻す
        </button>

        {!canToggle && (
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              marginTop: 8,
              userSelect: 'none',
            }}
          >
            onColumnsChange 未指定のため表示/非表示・リセットを変更できません
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default ColumnChooserPanel;