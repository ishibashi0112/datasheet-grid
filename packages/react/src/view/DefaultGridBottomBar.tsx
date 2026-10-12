import type { GridSelectionAggregates, SpreadsheetGridDerivedSummary } from '../model/gridTypes';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import type { GridResolvedSlot } from '../model/gridTypes';
import { formatSelectionAggregateNumber } from '@ishibashi0112/spreadsheet-grid-core/logic/selectionAggregates';

// 変更(監査 M-04): slot context を丸ごと受け取るのをやめ、使うフィールドだけを props にしました
//   (DefaultGridTopBar と同じ理由。開発ビルドで全行の配列が props の差分記録に走査されるのを避けます)。
type DefaultGridBottomBarProps = {
  derivedSummary: SpreadsheetGridDerivedSummary;
  selectionAggregates?: GridSelectionAggregates | null;
  // 追加: Rows / Columns の件数 chips(左グループ)を表示するかどうかです(既定 true)。
  showCounts?: boolean;
  // 追加(slot-props): classNames.statusBar の解決済みスロット(既定バーの root .ssg-bar--bottom へ)。
  slot?: GridResolvedSlot;
};

// 追加: Grid 下部の既定ステータスバーです。
// 変更(UI CSS移行): インライン style(gridBarStyles)を撤去し、styles.css の .ssg-bar-* クラスへ移行。
// 変更(件数トグル): Rows / Columns の件数 chips(左グループ)を showCounts で出し分けます。
//   右グループ(Active / Selection / 選択統計 / Cols)は本値の影響を受けず常時表示します。
// 追加(選択範囲の集計): 平均 / データの個数 / 合計を右グループの隣に出します(2 セル以上の選択時)。
//   変更(見直し): 右グループの中に足すとバーが折り返して高さが変わり(選択のたびにページが上下する)、CJK の
//   フォールバックフォントで行も 1px 伸びていたため、バーの空きにだけ置く別の要素にしました(SelectionAggregates)。
//   件数あり: [件数][集計(空きを埋めて右寄せ)][右グループ]、件数なし: [右グループ][集計(左寄せ)]。
//   どちらも既存のグループの位置と折り返しは変わりません。
export function DefaultGridBottomBar({
  derivedSummary,
  selectionAggregates,
  showCounts = true,
  slot,
}: DefaultGridBottomBarProps) {
  const aggregates = (
    <SelectionAggregates aggregates={selectionAggregates} trailing={!showCounts} />
  );

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

// 追加(選択範囲の集計): Excel のステータスバーと同じ「平均 / データの個数 / 合計」を並べます。
//   数値が 1 つも無い(文字だけ)ときは「データの個数」だけ、空のセルだけのときは何も出しません。
//   大きな選択の計算中は「集計中…」と進捗、SSRM で未読み込みの行を飛ばしたときは「読み込み済みの行のみ」を添えます。
//   外側(.ssg-bar-aggregates)は幅 0 から空きを埋める要素で、中身(.ssg-bar-aggregates-inner)は絶対配置です
//   (バーの折り返しと行の高さに影響しない)。入りきらないときは端から切れ、title で全文を出します。
function SelectionAggregates({
  aggregates,
  trailing,
}: {
  aggregates: GridSelectionAggregates | null | undefined;
  // 右グループの後ろ(件数なし)なら true: 区切り線を先頭に、中身を左寄せにします。
  trailing: boolean;
}) {
  if (!aggregates) {
    return null;
  }
  const chips: { key: string; text: string; label?: string; value?: string; muted?: boolean }[] = [];
  if (aggregates.status === 'computing') {
    chips.push({ key: 'computing', text: `集計中… ${Math.floor(aggregates.progress * 100)}%` });
  } else {
    if (aggregates.count === 0) {
      return null;
    }
    if (aggregates.average !== undefined) {
      const value = formatSelectionAggregateNumber(aggregates.average);
      chips.push({ key: 'average', text: `平均: ${value}`, label: '平均:', value });
    }
    const count = formatSelectionAggregateNumber(aggregates.count);
    chips.push({ key: 'count', text: `データの個数: ${count}`, label: 'データの個数:', value: count });
    if (aggregates.sum !== undefined) {
      const value = formatSelectionAggregateNumber(aggregates.sum);
      chips.push({ key: 'sum', text: `合計: ${value}`, label: '合計:', value });
    }
    if (aggregates.partial) {
      chips.push({ key: 'partial', text: '読み込み済みの行のみ', muted: true });
    }
  }
  const separator = <span className="ssg-bar-sep" aria-hidden="true" />;
  return (
    <div className={cx('ssg-bar-aggregates', trailing && 'ssg-bar-aggregates--trailing')}>
      <div className="ssg-bar-aggregates-inner" title={chips.map((chip) => chip.text).join('  ')}>
        {trailing ? separator : null}
        {chips.map((chip) => (
          <span key={chip.key} className={cx('ssg-bar-chip', chip.muted && 'ssg-bar-chip--muted')}>
            {chip.label !== undefined ? (
              <>
                {chip.label}
                <b className="ssg-bar-aggregate-value">{chip.value}</b>
              </>
            ) : (
              chip.text
            )}
          </span>
        ))}
        {trailing ? null : separator}
      </div>
    </div>
  );
}

export default DefaultGridBottomBar;