import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

type DefaultGridBottomBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
  // 追加: Rows / Columns の件数 chips(左グループ)を表示するかどうかです(既定 true)。
  showCounts?: boolean;
};

// 追加: Grid 下部の既定ステータスバーです。
// 変更(UI CSS移行): インライン style(gridBarStyles)を撤去し、styles.css の .ssg-bar-* クラスへ移行。
// 変更(件数トグル): Rows / Columns の件数 chips(左グループ)を showCounts で出し分けます。
//   右グループ(Active / Selection / 選択統計 / Cols)は本値の影響を受けず常時表示します。
export function DefaultGridBottomBar<T>({
  context,
  showCounts = true,
}: DefaultGridBottomBarProps<T>) {
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  return (
    <div className="ssg-bar--bottom">
      <div className="ssg-bar-container">
        {showCounts ? (
          <div className="ssg-bar-group">
            <span className="ssg-bar-chip">{derivedSummary.rowSummaryText}</span>
            <span className="ssg-bar-chip">
              {derivedSummary.columnSummaryText}
            </span>
          </div>
        ) : null}

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