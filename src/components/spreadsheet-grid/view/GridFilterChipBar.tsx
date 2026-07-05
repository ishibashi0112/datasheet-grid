// 追加(FM-2 / フィルターチップバー): 適用中の列フィルターをトップバー直下にチップで常時
//   一覧表示する opt-in バーです(showFilterChipBar prop・既定 false)。
//   - チップ本体クリック = 対象列へジャンプして既存のフィルター popover を開きます
//     (フィルター管理パネルの ✎ と同じ経路。配線は SpreadsheetGrid 側)。
//     × = その列のフィルターをクリア。末尾の「すべてクリア」は列フィルターのみ対象です
//     (グローバルフィルターは対象外 = フィルター管理パネルと同じ切り分け)。
//   - entries は FilterManagementPanel と完全共用です(要約文字列・非表示列の扱いが自動で
//     一致します)。グローバルフィルターのチップは出しません(入力欄とパネルが担当)。
//   - 有効フィルター 0 件のときは null を返します(空バーで縦領域を取らない = ユーザー合意)。
//   - ネスト <button> は不正 HTML のため、チップは <div> コンテナ + 「ラベル button(ジャンプ)」
//     「× button(クリア)」の 2 ボタン構成です。非表示列はラベル側を disabled にします
//     (ジャンプ先が無いため。× でのクリアは可能)。
//   - .ssg-root 内で描画されるため、ポータル系(popover/panel)と違いデザイントークン
//     (--ssg-*)が届きます(padding は --ssg-bar-pad-* で density 連動)。
import type { FilterManagementEntry } from './FilterManagementPanel';

type GridFilterChipBarProps = {
  // 適用中フィルターの一覧です(FilterManagementPanel と同じ構築物を受け取ります)。
  entries: FilterManagementEntry[];
  // enableColumnFilter 相当。false のときは操作を無効化します(保険)。
  canFilter: boolean;
  onEditFilter: (columnKey: string) => void;
  onClearFilter: (columnKey: string) => void;
  onClearAllFilters: () => void;
};

export function GridFilterChipBar({
  entries,
  canFilter,
  onEditFilter,
  onClearFilter,
  onClearAllFilters,
}: GridFilterChipBarProps) {
  // 有効フィルター 0 件は非表示です(合意 b: 空バーは出さない)。
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="ssg-filter-chip-bar">
      {entries.map((entry) => (
        <div
          key={entry.columnKey}
          className={
            entry.isHidden
              ? 'ssg-filter-chip ssg-filter-chip--hidden'
              : 'ssg-filter-chip'
          }
        >
          <button
            type="button"
            className="ssg-filter-chip-label"
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
            <span className="ssg-filter-chip-name">
              {entry.title}
              {entry.isHidden ? '(非表示列)' : ''}
            </span>
            <span className="ssg-filter-chip-summary">
              {entry.summaryText}
            </span>
          </button>
          <button
            type="button"
            className="ssg-filter-chip-clear"
            disabled={!canFilter}
            title="この列のフィルターをクリア"
            aria-label={`${entry.title} のフィルターをクリア`}
            onClick={() => {
              onClearFilter(entry.columnKey);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ssg-filter-chip-bar-clear-all"
        disabled={!canFilter}
        onClick={onClearAllFilters}
      >
        すべてクリア
      </button>
    </div>
  );
}

export default GridFilterChipBar;