import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

type DefaultGridBottomBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: Grid 下部の既定ステータスバーです。
// 変更(UI CSS移行): インライン style(gridBarStyles)を撤去し、styles.css の .ssg-bar-* クラスへ移行。
export function DefaultGridBottomBar<T>({
  context,
}: DefaultGridBottomBarProps<T>) {
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  return (
    <div className="ssg-bar--bottom">
      <div className="ssg-bar-container">
        <div className="ssg-bar-group">
          <span className="ssg-bar-chip">{derivedSummary.rowSummaryText}</span>
          <span className="ssg-bar-chip">
            {derivedSummary.columnSummaryText}
          </span>
        </div>

        <div className="ssg-bar-group">
          <span className="ssg-bar-chip">
            Active: {derivedSummary.activeCellLabel}
          </span>
          <span className="ssg-bar-chip">
            Selection: {derivedSummary.selectionLabel}
          </span>
          <span className="ssg-bar-chip">
            {derivedSummary.selectionStatsText}
          </span>
          <span className="ssg-bar-chip">
            Cols: {derivedSummary.selectionStats.selectedColumnCount}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DefaultGridBottomBar;