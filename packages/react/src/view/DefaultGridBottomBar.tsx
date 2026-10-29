import type { GridSelectionAggregates, SpreadsheetGridDerivedSummary } from '../model/gridTypes';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import type { GridResolvedSlot } from '../model/gridTypes';
import type { GridSelectionAggregates as GridSelectionAggregatesView } from './GridSelectionAggregates';

// 変更(監査 M-04): slot context を丸ごと受け取るのをやめ、使うフィールドだけを props にしました
//   (DefaultGridTopBar と同じ理由。開発ビルドで全行の配列が props の差分記録に走査されるのを避けます)。
type DefaultGridBottomBarProps = {
  derivedSummary: SpreadsheetGridDerivedSummary;
  selectionAggregates?: GridSelectionAggregates | null;
  // 追加: Rows / Columns の件数 chips(左グループ)を表示するかどうかです(既定 true)。
  showCounts?: boolean;
  // 追加(slot-props): classNames.statusBar の解決済みスロット(既定バーの root .ssg-bar--bottom へ)。
  slot?: GridResolvedSlot;
  // 変更(差し込み式 段階 2): 集計の表示部品(機能 features/selectionAggregates から。無ければ出さない)。
  SelectionAggregates?: typeof GridSelectionAggregatesView;
};

// 追加: Grid 下部の既定ステータスバーです。
// 変更(UI CSS移行): インライン style(gridBarStyles)を撤去し、styles.css の .ssg-bar-* クラスへ移行。
// 変更(件数トグル): Rows / Columns の件数 chips(左グループ)を showCounts で出し分けます。
//   右グループ(Active / Selection / 選択統計 / Cols)は本値の影響を受けず常時表示します。
// 追加(選択範囲の集計): 平均 / データの個数 / 合計を右グループの隣に出します(2 セル以上の選択時)。
//   変更(見直し): 右グループの中に足すとバーが折り返して高さが変わり(選択のたびにページが上下する)、CJK の
//   フォールバックフォントで行も 1px 伸びていたため、バーの空きにだけ置く別の要素にしました(SelectionAggregates。
//   差し込み式 段階 2 で view/GridSelectionAggregates へ移し、機能の表から受け取ります)。
//   件数あり: [件数][集計(空きを埋めて右寄せ)][右グループ]、件数なし: [右グループ][集計(左寄せ)]。
//   どちらも既存のグループの位置と折り返しは変わりません。
export function DefaultGridBottomBar({
  derivedSummary,
  selectionAggregates,
  showCounts = true,
  slot,
  SelectionAggregates,
}: DefaultGridBottomBarProps) {
  const aggregates = SelectionAggregates ? (
    <SelectionAggregates aggregates={selectionAggregates} trailing={!showCounts} />
  ) : null;

  return (
    <div className={cx('ssg-bar--bottom', slot?.className)} style={slot?.style}>
      <div className="ssg-bar-container">
        {showCounts ? (
          <div className="ssg-bar-group">
            <span className="ssg-bar-chip">{derivedSummary.rowSummaryText}</span>
            <span className="ssg-bar-chip">
              {derivedSummary.columnSummaryText}
            </span>
          </div>
        ) : null}
        {showCounts ? aggregates : null}

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
        {showCounts ? null : aggregates}
      </div>
    </div>
  );
}

export default DefaultGridBottomBar;