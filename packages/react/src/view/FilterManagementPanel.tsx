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
// 変更(UP-1): 統合ツールパネル(ToolPanel)の「フィルター」タブのコンテンツへ変更しました。
//   フレーム(portal / .ssg-popover / ドラッグヘッダー / ×)・テーマ修飾子・open/close・
//   ドラッグ移動はシェル(ToolPanel)と useToolPanelController の責務になり、本コンポーネント
//   は中身(グローバル行 / 一覧 / フッター)だけを描画します。タブ非アクティブ時は
//   アンマウントされるため、isOpen prop は不要になりました。

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
  // 適用中フィルターの一覧です(可視列の視覚順 → 非表示列の順。呼び出し側で構築)。
  entries: FilterManagementEntry[];
  addableColumns: FilterManagementAddableColumn[];
  // グローバルフィルター行の表示可否です(enableGlobalFilter かつ非空のとき true)。
  showGlobalFilterRow: boolean;
  globalFilterText: string;
  // enableColumnFilter 相当。false のときは操作を無効化します(保険。通常は開きません)。
  canFilter: boolean;
  // ✎: 対象列へジャンプして既存のフィルター popover を開きます(配線は呼び出し側)。
  onEditFilter: (columnKey: string) => void;
  // フィルターを追加: 選択列へジャンプして popover を開きます(✎ と同じ経路)。
  onAddFilter: (columnKey: string) => void;
  onClearFilter: (columnKey: string) => void;
  // すべてクリア: 列フィルターのみ対象です(グローバルは行の × のみ = ユーザー合意)。
  onClearAllFilters: () => void;
  onClearGlobalFilter: () => void;
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
  entries,
  addableColumns,
  showGlobalFilterRow,
  globalFilterText,
  canFilter,
  onEditFilter,
  onAddFilter,
  onClearFilter,
  onClearAllFilters,
  onClearGlobalFilter,
}: FilterManagementPanelProps) {
  const canClearAll = canFilter && entries.length > 0;
  const canAdd = canFilter && addableColumns.length > 0;

  return (
    <>
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
              data-ssg-tooltip={globalFilterText}
            >
              "{globalFilterText}" を含む行
            </span>
          </span>
          <span className="ssg-filter-manage-actions">
            <button
              type="button"
              className="ssg-filter-manage-icon-btn ssg-filter-manage-icon-btn--danger"
              disabled={!canFilter}
              data-ssg-tooltip="グローバルフィルターをクリア"
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
                  data-ssg-tooltip={entry.summaryText}
                >
                  {entry.summaryText}
                </span>
              </span>
              <span className="ssg-filter-manage-actions">
                <button
                  type="button"
                  className="ssg-filter-manage-icon-btn"
                  disabled={!canFilter || entry.isHidden}
                  data-ssg-tooltip={
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
                  data-ssg-tooltip="この列のフィルターをクリア"
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
    </>
  );
}

export default FilterManagementPanel;