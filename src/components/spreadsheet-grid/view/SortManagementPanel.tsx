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
import { cx } from '../logic/cx';
import type { CSSProperties, KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { GridSortEntry } from '../model/gridTypes';
import type { SortManagementLayout } from '../hooks/useSortManagementController';
// 追加(FM-4): ヘッダーを掴んでパネルを移動する共有フックです(3 パネル共通)。
import { usePanelHeaderDrag } from '../hooks/usePanelHeaderDrag';

// 追加(MS-3-1): パネルが必要とする最小の列情報です(並び替え可能な列のみを渡します)。
export type SortManagementColumn = {
  key: string;
  title: string;
};

type SortManagementPanelProps = {
  isOpen: boolean;
  // 追加(TH-DK-2): ダークテーマ修飾子クラス('ssg-theme-dark' | undefined)。ポータルは
  //   .ssg-root 外のため、root と同じ修飾子を自身の root 要素へ直接付与します。
  themeClassName?: string;
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
  // 追加(FM-4): ヘッダードラッグによるパネル移動です(controller の moveSortManager を
  //   受け取ります。位置の clamp・保持・close 時リセットは controller 側の責務)。
  onPanelMove: (top: number, left: number) => void;
};

// 追加(MS-3-2): ⠿ ドラッグハンドルの見た目です(2×3 の点)。ColumnChooserPanel と同型。
//   操作系(pointerdown / capture)は行側に配線し、ここは見た目のみを描画します。
function DragHandleGlyph({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      // 変更(TH-DK-1): fill はプレゼンテーション属性だと var() を解釈しないため style で指定します。
      style={{
        fill: disabled
          ? 'var(--ssg-panel-text-disabled)'
          : 'var(--ssg-panel-text-faint)',
      }}
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
  themeClassName,
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
  onPanelMove,
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

  // 追加(FM-4): ヘッダーを掴んでパネルを移動します(hooks は早期 return より前・無条件で
  //   呼びます。layout=null のときはフック側が開始しません)。
  const { handleHeaderPointerDown } = usePanelHeaderDrag({
    layout,
    onPanelMove,
  });

  if (!isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    top: layout.top,
    left: layout.left,
    width: layout.width,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // パネル内 pointer 操作を grid 側へ伝播させません(列選択開始 / outside click 競合回避)。
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // portal 内 keyboard を React ツリー上の parent へ流しません。
    // Escape での close は controller の window keydown が担当します。
    // 変更(POP-KEY): capture 相(onKeyDownCapture)→ bubble 相(onKeyDown)へ変更します。
    //   capture 相の stopPropagation() はネイティブ伝播ごと止めるため、パネル内部要素の
    //   bubble 相 onKeyDown や window(bubble)リスナーまで殺してしまいます
    //   (ColumnFilterPopover の SF-ENTER fix と同一パターンの統一です)。bubble 相なら
    //   「内部要素のハンドラが先に処理 → 最後にここで外側への合成バブリングだけ遮断」に
    //   なり、Escape close は controller 側の capture 登録(POP-KEY)が受けます。
    event.stopPropagation();
  };

  const canAddLevel = canSort && firstUnusedColumn !== null;

  return createPortal(
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className={cx('ssg-popover', 'ssg-sort-panel', themeClassName)}
      style={wrapperStyle}
    >
      {/* ── ヘッダー: タイトル + × ── */}
      <div
        className="ssg-popover-header ssg-popover-header--draggable"
        onPointerDown={handleHeaderPointerDown}
      >
        <span className="ssg-popover-title">並び替え</span>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="閉じる"
          className="ssg-popover-close"
        >
          ×
        </button>
      </div>

      {/* ── レベル一覧(スクロール) ── */}
      <div ref={listRef} className="ssg-sort-list">
        {entries.length === 0 ? (
          <div className="ssg-sort-empty">並び替えは設定されていません</div>
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
                className={cx(
                  'ssg-sort-level',
                  showDropBefore && 'ssg-sort-level--drop-before',
                  isDragging && 'ssg-sort-level--dragging',
                )}
              >
                {/* ⠿ ドラッグハンドル(MS-3-2) */}
                <span
                  role="button"
                  aria-label="ドラッグして優先順位を変更"
                  data-ssg-tooltip={
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
                  className={cx(
                    'ssg-sort-handle',
                    !canDrag && 'ssg-sort-handle--disabled',
                    isDragging && 'ssg-sort-handle--dragging',
                  )}
                >
                  <DragHandleGlyph disabled={!canDrag} />
                </span>

                {/* 優先度バッジ(1 始まり)。ヘッダーの優先順位番号と意味を揃えます。 */}
                <span aria-hidden className="ssg-sort-badge">
                  {index + 1}
                </span>

                {/* 列セレクト */}
                <select
                  value={entry.columnKey}
                  disabled={!canSort}
                  onChange={(event) => onChangeColumn(index, event.target.value)}
                  className="ssg-sort-select"
                >
                  {resolvedOptions.map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.title}
                    </option>
                  ))}
                </select>

                {/* 方向セグメント(昇順 / 降順) */}
                <div className="ssg-sort-dir-group">
                  <button
                    type="button"
                    disabled={!canSort}
                    onClick={() => onChangeDirection(index, 'asc')}
                    data-ssg-tooltip="昇順"
                    className={cx(
                      'ssg-sort-dir-btn',
                      entry.direction === 'asc' && 'ssg-sort-dir-btn--active',
                    )}
                  >
                    ↑ 昇順
                  </button>
                  <button
                    type="button"
                    disabled={!canSort}
                    onClick={() => onChangeDirection(index, 'desc')}
                    data-ssg-tooltip="降順"
                    className={cx(
                      'ssg-sort-dir-btn',
                      entry.direction === 'desc' && 'ssg-sort-dir-btn--active',
                    )}
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
                  data-ssg-tooltip="このレベルを削除"
                  className="ssg-sort-delete"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
        {/* 末尾へのドロップインジケータ(MS-3-2): 最後の行の後ろに挿入される位置のとき。 */}
        {draggingIndex !== null && dropIndex === entries.length && (
          <div className="ssg-sort-drop-end" />
        )}
      </div>

      {/* ── フッター: 基準を追加 / すべてクリア ── */}
      <div className="ssg-popover-footer">
        <button
          type="button"
          disabled={!canAddLevel}
          onClick={() => {
            if (!canAddLevel || !firstUnusedColumn) {
              return;
            }
            onAddLevel(firstUnusedColumn.key, 'asc');
          }}
          data-ssg-tooltip={
            !canSort
              ? '並び替えが無効です'
              : firstUnusedColumn === null
                ? 'すべての列が並び替えに使われています'
                : '並び替えの基準を追加します'
          }
          className="ssg-sort-footer-btn ssg-sort-footer-btn--add"
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
          data-ssg-tooltip="すべての並び替えを解除します"
          className="ssg-sort-footer-btn ssg-sort-footer-btn--clear"
        >
          すべてクリア
        </button>
      </div>

      {!canSort && (
        <div className="ssg-sort-note">
          並び替えが無効のため編集できません
        </div>
      )}
    </div>,
    document.body,
  );
}

export default SortManagementPanel;