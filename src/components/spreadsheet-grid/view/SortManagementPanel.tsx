// 追加(MS-3-1 / 並び替え管理パネル): 複数レベルの並び替えをマウス/タッチで編集する
//   独立 popover です(Excel の「並べ替え」ダイアログ相当 / ColumnChooserPanel の兄弟)。
//   - タイトル + × クローズ / レベル一覧(優先度・列セレクト・方向・削除) /
//     フッター(基準を追加 / すべてクリア)で構成します。
//   - 本コンポーネントは非ジェネリックです(ColumnChooserPanel と同様、プリミティブな
//     entries / columns だけを受け取ります)。編集はライブ適用で、各操作は即座に
//     呼び出し側(SpreadsheetGrid)のハンドラ経由で uiState.sort(単一ソース)へ反映します。
//     パネルは編集後も開いたまま(× / outside click / Escape でのみ閉じます)。
//   - 並び替えロジックは持ちません。操作は index / key / direction の「意図」を emit し、
//     次状態の算出(logic/sorting.ts の純関数)と dispatch は呼び出し側が担います。
//   - 変更(MS-3-2 / 優先順位 DnD): 各レベル行の左端に ⠿ ドラッグハンドルを追加し、
//     pointer ベースで優先順位を並べ替えます(ColumnChooserPanel の DnD 機構を移植。ただし
//     単一フラットリストのためセクション分け・オートスクロールは省略。ドロップ前線インジ
//     ケータは踏襲)。確定時は from / 補正済み to を onMove へ emit し、次状態の算出
//     (moveSortEntry)と dispatch は呼び出し側が担います。ドラッグは canSort かつ
//     レベル 2 件以上のときのみ可能です。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { GridSortEntry } from '../model/gridTypes';
import type { SortManagementLayout } from '../hooks/useSortManagementController';

// 追加(MS-3-1): パネルが必要とする最小の列情報です(並び替え可能な列のみを渡します)。
export type SortManagementColumn = {
  key: string;
  title: string;
};

type SortManagementPanelProps = {
  isOpen: boolean;
  // 現在の並び替え(優先順位順)です。uiState.sort をそのまま渡せます。
  entries: GridSortEntry[];
  // 並び替え対象に選べる列の一覧です(呼び出し側で visibleColumns から作ります)。
  columns: SortManagementColumn[];
  // enableSorting 相当。false のときは編集を無効化し注記を出します(保険。通常は開きません)。
  canSort: boolean;
  layout: SortManagementLayout | null;
  panelRef: RefObject<HTMLDivElement | null>;
  // レベルを末尾へ追加します(呼び出し側が未使用列を選んで渡すか、ここで渡す key を採用)。
  onAddLevel: (columnKey: string, direction: 'asc' | 'desc') => void;
  onChangeDirection: (index: number, direction: 'asc' | 'desc') => void;
  onChangeColumn: (index: number, columnKey: string) => void;
  onRemoveLevel: (index: number) => void;
  onClearAll: () => void;
  // 追加(MS-3-2): 優先順位 DnD の確定ハンドラです。from(掴んだレベル)と to(除去後の
  //   挿入先 index)を渡します。ドロップ位置からの -1 補正はパネル内で済ませているため、
  //   呼び出し側は moveSortEntry(sort, from, to) をそのまま呼べます。canSort かつ
  //   レベル 2 件以上のときのみ、かつ実際に位置が動いたときのみ呼ばれます。
  onMove: (from: number, to: number) => void;
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

// 追加(MS-3-1): 方向セグメント(昇順 / 降順)1 ボタンの style です。
const directionButtonStyle = (
  active: boolean,
  disabled: boolean,
): CSSProperties => ({
  flex: '0 0 auto',
  boxSizing: 'border-box',
  padding: '4px 9px',
  border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
  backgroundColor: active ? '#2563eb' : '#ffffff',
  color: disabled ? '#cbd5e1' : active ? '#ffffff' : '#475569',
  fontSize: 12,
  lineHeight: 1.4,
  cursor: disabled ? 'default' : 'pointer',
});

// 追加(MS-3-2): ⠿ ドラッグハンドルの見た目です(2×3 の点)。ColumnChooserPanel と同型。
//   操作系(pointerdown / capture)は行側に配線し、ここは見た目のみを描画します。
function DragHandleGlyph({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      fill={disabled ? '#cbd5e1' : '#94a3b8'}
      aria-hidden
    >
      {[3, 8, 13].map((cy) =>
        [3, 7].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" />
        )),
      )}
    </svg>
  );
}

export function SortManagementPanel({
  isOpen,
  entries,
  columns,
  canSort,
  layout,
  panelRef,
  onAddLevel,
  onChangeDirection,
  onChangeColumn,
  onRemoveLevel,
  onClearAll,
  onMove,
  onRequestClose,
}: SortManagementPanelProps) {
  // 既に並び替えに使われている列キーの集合です(列セレクトの候補絞り込みに使います)。
  const usedKeys = useMemo(
    () => new Set(entries.map((entry) => entry.columnKey)),
    [entries],
  );

  // 未使用の最初の列(「基準を追加」で追加する列)です。なければ追加不可。
  const firstUnusedColumn = useMemo(
    () => columns.find((column) => !usedKeys.has(column.key)) ?? null,
    [columns, usedKeys],
  );

  const titleOf = (key: string) =>
    columns.find((column) => column.key === key)?.title ?? key;

  // ── 優先順位 DnD(MS-3-2) ───────────────────────────────
  //   ColumnChooserPanel の pointer 機構を移植。単一フラットリストのため pane 走査・
  //   オートスクロールは省略し、ドロップ前線インジケータのみ踏襲します。
  //   ※ 下記フックはすべて早期 return (!isOpen || !layout) より前に置きます
  //     (条件付き hook 呼び出しを避けるため)。
  // ドラッグ可否: 並び替え有効、かつレベルが 2 件以上のときのみ。
  const canDrag = canSort && entries.length >= 2;
  const listRef = useRef<HTMLDivElement | null>(null);
  // ドラッグ中のレベル index(null = 非ドラッグ)。dragActiveRef は state 反映前の連続
  //   pointer イベントでも確実に効くよう、早期 return 判定を ref で持ちます。
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragActiveRef = useRef(false);
  // ドロップ挿入スロット(0..entries.length。length = 末尾)。インジケータ描画に使います。
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const pointerYRef = useRef(0);

  // ポインタ Y から「行 midpoint より上にある行数」= 挿入スロットを求めます。
  const updateDropFromPointer = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const rows = list.querySelectorAll<HTMLElement>('[data-sort-level]');
    const y = pointerYRef.current;
    let index = rows.length;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDropIndex(index);
  }, []);

  const finishDrag = useCallback(
    (commit: boolean) => {
      const from = draggingIndex;
      const rawTo = dropIndex;
      dragActiveRef.current = false;
      setDraggingIndex(null);
      setDropIndex(null);
      if (commit && from !== null && rawTo !== null) {
        // 挿入スロット(除去前基準 0..length)→ 除去後 index へ補正します。
        let to = rawTo;
        if (to > from) {
          to -= 1;
        }
        // moveSortEntry 側で from === to / 範囲外は同一参照になるため、no-op ドラッグでも
        //   無駄な setSort 参照変化は起きません。
        onMove(from, to);
      }
    },
    [draggingIndex, dropIndex, onMove],
  );

  const handleHandlePointerDown = useCallback(
    (index: number, event: PointerEvent<HTMLElement>) => {
      if (!canDrag) {
        return;
      }
      // 既定のテキスト選択 / 行操作を抑止し、grid 側へも伝播させません。
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragActiveRef.current = true;
      pointerYRef.current = event.clientY;
      setDraggingIndex(index);
      updateDropFromPointer();
    },
    [canDrag, updateDropFromPointer],
  );

  const handleHandlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragActiveRef.current) {
        return;
      }
      pointerYRef.current = event.clientY;
      updateDropFromPointer();
    },
    [updateDropFromPointer],
  );

  const handleHandlePointerUp = useCallback(() => {
    if (!dragActiveRef.current) {
      return;
    }
    finishDrag(true);
  }, [finishDrag]);

  const handleHandlePointerCancel = useCallback(() => {
    if (!dragActiveRef.current) {
      return;
    }
    finishDrag(false);
  }, [finishDrag]);

  // panel が閉じるときはドラッグ状態を確実に後始末します(rAF は持たないため不要)。
  useEffect(() => {
    if (!isOpen) {
      dragActiveRef.current = false;
      setDraggingIndex(null);
      setDropIndex(null);
    }
  }, [isOpen]);

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
    // パネル内 pointer 操作を grid 側へ伝播させません(列選択開始 / outside click 競合回避)。
    event.stopPropagation();
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // portal 内 keyboard を React ツリー上の parent へ流しません。
    // Escape での close は controller の window keydown が担当します。
    event.stopPropagation();
  };

  const canAddLevel = canSort && firstUnusedColumn !== null;

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
          並び替え
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

      {/* ── レベル一覧(スクロール) ── */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          margin: '0 -4px',
          padding: '0 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: '#94a3b8',
              padding: '10px 4px',
              userSelect: 'none',
            }}
          >
            並び替えは設定されていません
          </div>
        ) : (
          entries.map((entry, index) => {
            // この行の列セレクト候補: 自分の列 + 他レベルで未使用の列。
            const options = columns.filter(
              (column) =>
                column.key === entry.columnKey || !usedKeys.has(column.key),
            );
            // 万一この列が columns(= 可視列)に無い(後から非表示化された等)場合でも、
            // セレクトの value が候補に無いと表示が崩れるため、合成候補を先頭に補います。
            const hasOwn = options.some(
              (column) => column.key === entry.columnKey,
            );
            const resolvedOptions = hasOwn
              ? options
              : [{ key: entry.columnKey, title: titleOf(entry.columnKey) }, ...options];

            // 優先順位 DnD(MS-3-2): この行を掴んでいるか / この行の直前に挿入するか。
            const isDragging = draggingIndex === index;
            const showDropBefore =
              draggingIndex !== null && dropIndex === index;

            return (
              <div
                key={entry.columnKey}
                data-sort-level=""
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  // ドロップ前線インジケータ(行の直前に挿入される位置のとき青線)。
                  borderTop: showDropBefore
                    ? '2px solid #2563eb'
                    : '2px solid transparent',
                  opacity: isDragging ? 0.4 : 1,
                }}
              >
                {/* ⠿ ドラッグハンドル(MS-3-2) */}
                <span
                  role="button"
                  aria-label="ドラッグして優先順位を変更"
                  title={
                    !canSort
                      ? '並び替えが無効です'
                      : entries.length < 2
                        ? 'レベルが 2 件以上のとき並べ替えできます'
                        : 'ドラッグして優先順位を変更'
                  }
                  onPointerDown={(event) =>
                    handleHandlePointerDown(index, event)
                  }
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerCancel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    width: 16,
                    height: 26,
                    borderRadius: 6,
                    cursor: !canDrag
                      ? 'default'
                      : isDragging
                        ? 'grabbing'
                        : 'grab',
                    touchAction: 'none',
                  }}
                  onPointerEnter={(event) => {
                    if (canDrag) {
                      event.currentTarget.style.backgroundColor = '#f1f5f9';
                    }
                  }}
                  onPointerLeave={(event) => {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <DragHandleGlyph disabled={!canDrag} />
                </span>

                {/* 優先度バッジ(1 始まり)。ヘッダーの優先順位番号と意味を揃えます。 */}
                <span
                  aria-hidden
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    fontSize: 11,
                    fontWeight: 700,
                    userSelect: 'none',
                  }}
                >
                  {index + 1}
                </span>

                {/* 列セレクト */}
                <select
                  value={entry.columnKey}
                  disabled={!canSort}
                  onChange={(event) => onChangeColumn(index, event.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    boxSizing: 'border-box',
                    padding: '5px 6px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#334155',
                    backgroundColor: '#ffffff',
                    cursor: canSort ? 'pointer' : 'default',
                  }}
                >
                  {resolvedOptions.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.title}
                    </option>
                  ))}
                </select>

                {/* 方向セグメント(昇順 / 降順) */}
                <div style={{ flex: '0 0 auto', display: 'flex' }}>
                  <button
                    type="button"
                    disabled={!canSort}
                    onClick={() => onChangeDirection(index, 'asc')}
                    title="昇順"
                    style={{
                      ...directionButtonStyle(entry.direction === 'asc', !canSort),
                      borderTopLeftRadius: 6,
                      borderBottomLeftRadius: 6,
                      borderRight: 'none',
                    }}
                  >
                    ↑ 昇順
                  </button>
                  <button
                    type="button"
                    disabled={!canSort}
                    onClick={() => onChangeDirection(index, 'desc')}
                    title="降順"
                    style={{
                      ...directionButtonStyle(entry.direction === 'desc', !canSort),
                      borderTopRightRadius: 6,
                      borderBottomRightRadius: 6,
                    }}
                  >
                    ↓ 降順
                  </button>
                </div>

                {/* 削除 */}
                <button
                  type="button"
                  disabled={!canSort}
                  onClick={() => onRemoveLevel(index)}
                  aria-label="このレベルを削除"
                  title="このレベルを削除"
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    border: 'none',
                    borderRadius: 6,
                    backgroundColor: 'transparent',
                    color: canSort ? '#64748b' : '#cbd5e1',
                    cursor: canSort ? 'pointer' : 'default',
                    fontSize: 15,
                    lineHeight: 1,
                  }}
                  onPointerEnter={(event) => {
                    if (canSort) {
                      event.currentTarget.style.backgroundColor = '#fef2f2';
                      event.currentTarget.style.color = '#dc2626';
                    }
                  }}
                  onPointerLeave={(event) => {
                    event.currentTarget.style.backgroundColor = 'transparent';
                    event.currentTarget.style.color = canSort ? '#64748b' : '#cbd5e1';
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
        {/* 末尾へのドロップインジケータ(MS-3-2): 最後の行の後ろに挿入される位置のとき。 */}
        {draggingIndex !== null && dropIndex === entries.length && (
          <div
            style={{
              height: 0,
              borderTop: '2px solid #2563eb',
            }}
          />
        )}
      </div>

      {/* ── フッター: 基準を追加 / すべてクリア ── */}
      <div
        style={{
          paddingTop: 8,
          marginTop: 8,
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          disabled={!canAddLevel}
          onClick={() => {
            if (!canAddLevel || !firstUnusedColumn) {
              return;
            }
            onAddLevel(firstUnusedColumn.key, 'asc');
          }}
          title={
            !canSort
              ? '並び替えが無効です'
              : firstUnusedColumn === null
                ? 'すべての列が並び替えに使われています'
                : '並び替えの基準を追加します'
          }
          style={{
            flex: 1,
            boxSizing: 'border-box',
            padding: '7px 8px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            backgroundColor: 'transparent',
            color: canAddLevel ? '#334155' : '#cbd5e1',
            cursor: canAddLevel ? 'pointer' : 'default',
            fontSize: 13,
            textAlign: 'center',
            userSelect: 'none',
          }}
          onPointerEnter={(event) => {
            if (canAddLevel) {
              event.currentTarget.style.backgroundColor = '#f1f5f9';
            }
          }}
          onPointerLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ＋ 基準を追加
        </button>

        <button
          type="button"
          disabled={!canSort || entries.length === 0}
          onClick={() => {
            if (!canSort || entries.length === 0) {
              return;
            }
            onClearAll();
          }}
          title="すべての並び替えを解除します"
          style={{
            flex: '0 0 auto',
            boxSizing: 'border-box',
            padding: '7px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            backgroundColor: 'transparent',
            color: !canSort || entries.length === 0 ? '#cbd5e1' : '#334155',
            cursor: !canSort || entries.length === 0 ? 'default' : 'pointer',
            fontSize: 13,
            textAlign: 'center',
            userSelect: 'none',
          }}
          onPointerEnter={(event) => {
            if (canSort && entries.length > 0) {
              event.currentTarget.style.backgroundColor = '#f1f5f9';
            }
          }}
          onPointerLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          すべてクリア
        </button>
      </div>

      {!canSort && (
        <div
          style={{
            fontSize: 11,
            color: '#94a3b8',
            marginTop: 8,
            userSelect: 'none',
          }}
        >
          並び替えが無効のため編集できません
        </div>
      )}
    </div>,
    document.body,
  );
}

export default SortManagementPanel;
