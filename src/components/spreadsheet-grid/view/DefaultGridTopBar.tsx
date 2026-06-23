import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

type DefaultGridTopBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: Grid 上部の既定ツールバーです。現時点では Global Filter を主役にしつつ、
//       左側へ件数サマリを薄く出します。
// 変更(UI CSS移行): インライン style(gridBarStyles)を撤去し、styles.css の .ssg-bar-* クラスへ移行。
export function DefaultGridTopBar<T>({
  context,
}: DefaultGridTopBarProps<T>) {
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  return (
    <div className="ssg-bar--top">
      <div className="ssg-bar-container">
        <div className="ssg-bar-group ssg-bar-leading">
          <span className="ssg-bar-title">Toolbar</span>

          <span className="ssg-bar-chip ssg-bar-chip--emphasis">
            {derivedSummary.rowSummaryText}
          </span>

          <span className="ssg-bar-chip ssg-bar-chip--emphasis">
            {derivedSummary.columnSummaryText}
          </span>

          <span className="ssg-bar-chip ssg-bar-chip--emphasis">
            {derivedSummary.filterSummaryText}
          </span>

          <span className="ssg-bar-chip ssg-bar-chip--emphasis">
            {derivedSummary.sortSummaryText}
          </span>
        </div>

        <div className="ssg-bar-input-group">
          <input
            type="text"
            value={context.globalFilterText}
            onChange={(event) => context.setGlobalFilterText(event.target.value)}
            placeholder="グローバルフィルター"
            className="ssg-bar-input"
          />
          {context.globalFilterText.trim().length > 0 ? (
            <button
              type="button"
              onClick={() => context.setGlobalFilterText('')}
              className="ssg-bar-clear-btn"
            >
              クリア
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default DefaultGridTopBar;