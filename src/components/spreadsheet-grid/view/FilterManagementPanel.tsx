// 追加(FM-1 / フィルター管理パネル): 適用中のフィルターを一覧し、編集(ジャンプ)/ 個別
//   クリア / 追加 / すべてクリアを行う独立 popover です(SortManagementPanel の兄弟)。
//   - タイトル + × クローズ / (任意)グローバルフィルター行 / 適用中フィルター一覧 /
//     フッター(フィルターを追加 <select> / すべてクリア)で構成します。
//   - 本コンポーネントは非ジェネリックです(ColumnChooserPanel / SortManagementPanel と
//     同様、プリミティブな entries / addableColumns だけを受け取ります)。
//   - フィルターの評価・状態は持ちません。操作は columnKey の「意図」を emit し、
//     ジャンプ + popover open(✎ / 追加)や dispatch(× / すべてクリア)は呼び出し側
//     (SpreadsheetGrid)が担います。
//   - パネルは操作後も開いたまま(× / outside click / Escape でのみ閉じます。Sort と同じ。
//     フィルター popover との共存 = alliedRef / suppressEscape は controller 側の責務です)。
//   - 非表示列のフィルターも一覧に出します(「見えない列に絞り込みが残っている」という
//     発見性の穴を塞ぐのが本機能の主目的のためです)。✎ はジャンプ先が無いため disabled に
//     し、title で理由を出します(× でのクリアは可能)。
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { FilterManagementLayout } from '../hooks/useFilterManagementController';
// 追加(FM-4): ヘッダーを掴んでパネルを移動する共有フックです(3 パネル共通)。
import { usePanelHeaderDrag } from '../hooks/usePanelHeaderDrag';

// 追加(FM-1): 一覧 1 行ぶんの情報です(要約文字列は logic/filterSummary.ts で生成済み)。
export type FilterManagementEntry = {
  columnKey: string;
  title: string;
  summaryText: string;
  // 非表示列(visible=false)のフィルターです。✎(ジャンプ編集)を無効化します。
  isHidden: boolean;
};

// 追加(FM-1): 「フィルターを追加」<select> の候補です(可視・filterType あり・未適用)。
export type FilterManagementAddableColumn = {
  key: string;
  title: string;
};

type FilterManagementPanelProps = {
  isOpen: boolean;
  // 適用中フィルターの一覧です(可視列の視覚順 → 非表示列の順。呼び出し側で構築)。
  entries: FilterManagementEntry[];
  addableColumns: FilterManagementAddableColumn[];
  // グローバルフィルター行の表示可否です(enableGlobalFilter かつ非空のとき true)。
  showGlobalFilterRow: boolean;
  globalFilterText: string;
  // enableColumnFilter 相当。false のときは操作を無効化します(保険。通常は開きません)。
  canFilter: boolean;
  layout: FilterManagementLayout | null;
  panelRef: RefObject<HTMLDivElement | null>;
  // ✎: 対象列へジャンプして既存のフィルター popover を開きます(配線は呼び出し側)。
  onEditFilter: (columnKey: string) => void;
  // フィルターを追加: 選択列へジャンプして popover を開きます(✎ と同じ経路)。
  onAddFilter: (columnKey: string) => void;
  onClearFilter: (columnKey: string) => void;
  // すべてクリア: 列フィルターのみ対象です(グローバルは行の × のみ = ユーザー合意)。
  onClearAllFilters: () => void;
  onClearGlobalFilter: () => void;
  onRequestClose: () => void;
  // 追加(FM-4): ヘッダードラッグによるパネル移動です(controller の moveFilterManager を
  //   受け取ります。位置の clamp・保持・close 時リセットは controller 側の責務)。
  onPanelMove: (top: number, left: number) => void;
};

// 追加(FM-1): 漏斗グリフです(GridHeaderRow のフィルター適用中マークと同一パス)。
function FunnelGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 4 L14 4 L9.2 9.2 L9.2 13 L6.8 13 L6.8 9.2 Z" />
    </svg>
  );
}

// 追加(FM-1): 虫めがねグリフです(トップバーのグローバルフィルター入力アイコンと同形)。
function SearchGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function FilterManagementPanel({
  isOpen,
  entries,
  addableColumns,
  showGlobalFilterRow,
  globalFilterText,
  canFilter,
  layout,
  panelRef,
  onEditFilter,
  onAddFilter,
  onClearFilter,
  onClearAllFilters,
  onClearGlobalFilter,
  onRequestClose,
  onPanelMove,
}: FilterManagementPanelProps) {
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
    // パネル内 pointer 操作を grid 側へ伝播させません(セル選択開始 / outside click 競合回避)。
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // portal 内 keyboard を React ツリー上の parent へ流しません。
    // Escape での close は controller の window keydown(capture / POP-KEY)が担当します。
    event.stopPropagation();
  };

  const canClearAll = canFilter && entries.length > 0;
  const canAdd = canFilter && addableColumns.length > 0;

  return createPortal(
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className="ssg-popover ssg-filter-manage-panel"
      style={wrapperStyle}
    >
      {/* ── ヘッダー: タイトル + × ── */}
      <div
        className="ssg-popover-header ssg-popover-header--draggable"
        onPointerDown={handleHeaderPointerDown}
      >
        <span className="ssg-popover-title">フィルター管理</span>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="閉じる"
          className="ssg-popover-close"
        >
          ×
        </button>
      </div>

      {/* ── グローバルフィルター行(先頭・区切り付き) ── */}
      {/* 追加(FM-1): 列フィルターと別枠で先頭に出します。「すべてクリア」の対象外で、
          解除はこの行の × のみです(ユーザー合意の切り分け)。 */}
      {showGlobalFilterRow && (
        <div className="ssg-filter-manage-row ssg-filter-manage-row--global">
          <span
            className="ssg-filter-manage-glyph ssg-filter-manage-glyph--global"
            aria-hidden="true"
          >
            <SearchGlyph />
          </span>
          <span className="ssg-filter-manage-main">
            <span className="ssg-filter-manage-name">グローバルフィルター</span>
            <span
              className="ssg-filter-manage-summary"
              title={globalFilterText}
            >
              "{globalFilterText}" を含む行
            </span>
          </span>
          <span className="ssg-filter-manage-actions">
            <button
              type="button"
              className="ssg-filter-manage-icon-btn ssg-filter-manage-icon-btn--danger"
              disabled={!canFilter}
              title="グローバルフィルターをクリア"
              aria-label="グローバルフィルターをクリア"
              onClick={onClearGlobalFilter}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* ── 適用中フィルター一覧(スクロール) ── */}
      <div className="ssg-filter-manage-list">
        {entries.length === 0 ? (
          <div className="ssg-filter-manage-empty">
            適用中の列フィルターはありません
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.columnKey} className="ssg-filter-manage-row">
              <span className="ssg-filter-manage-glyph" aria-hidden="true">
                <FunnelGlyph />
              </span>
              <span className="ssg-filter-manage-main">
                <span className="ssg-filter-manage-name">
                  {entry.title}
                  {entry.isHidden && (
                    <span className="ssg-filter-manage-hidden-note">
                      (非表示列)
                    </span>
                  )}
                </span>
                <span
                  className="ssg-filter-manage-summary"
                  title={entry.summaryText}
                >
                  {entry.summaryText}
                </span>
              </span>
              <span className="ssg-filter-manage-actions">
                <button
                  type="button"
                  className="ssg-filter-manage-icon-btn"
                  disabled={!canFilter || entry.isHidden}
                  title={
                    entry.isHidden
                      ? '非表示列のためジャンプ編集できません(× でクリアは可能)'
                      : 'この列へジャンプして編集'
                  }
                  aria-label={`${entry.title} のフィルターを編集`}
                  onClick={() => {
                    onEditFilter(entry.columnKey);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="ssg-filter-manage-icon-btn ssg-filter-manage-icon-btn--danger"
                  disabled={!canFilter}
                  title="この列のフィルターをクリア"
                  aria-label={`${entry.title} のフィルターをクリア`}
                  onClick={() => {
                    onClearFilter(entry.columnKey);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {/* ── フッター: フィルターを追加 + すべてクリア ── */}
      {/* 追加(FM-1): 追加は <select> の 1 操作で列を選ぶ形です(選択で即ジャンプ + popover。
          value は常に '' の controlled のため、選択後は自動でプレースホルダへ戻ります)。 */}
      <div className="ssg-popover-footer">
        <select
          className="ssg-filter-manage-add"
          value=""
          disabled={!canAdd}
          aria-label="フィルターを追加する列を選択"
          onChange={(event) => {
            const key = event.target.value;
            if (key) {
              onAddFilter(key);
            }
          }}
        >
          <option value="">
            {canAdd ? '+ フィルターを追加…' : '+ 追加できる列がありません'}
          </option>
          {addableColumns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ssg-filter-manage-clear-all"
          disabled={!canClearAll}
          onClick={onClearAllFilters}
        >
          すべてクリア
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default FilterManagementPanel;