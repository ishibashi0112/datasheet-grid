// 追加(選択範囲の集計)/ 変更(差し込み式 段階 2): 既定の下部バー(DefaultGridBottomBar)に出す選択範囲の集計です。
//   DefaultGridBottomBar から移しただけで中身は同じです(機能 features/selectionAggregates の部品)。
import type { GridSelectionAggregates as GridSelectionAggregatesValue } from '../model/gridTypes';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { formatSelectionAggregateNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates';

// 追加(選択範囲の集計): Excel のステータスバーと同じ「平均 / データの個数 / 合計」を並べます。
//   数値が 1 つも無い(文字だけ)ときは「データの個数」だけ、空のセルだけのときは何も出しません。
//   大きな選択の計算中は「集計中…」と進捗、SSRM で未読み込みの行を飛ばしたときは「読み込み済みの行のみ」を添えます。
//   外側(.ssg-bar-aggregates)は幅 0 から空きを埋める要素で、中身(.ssg-bar-aggregates-inner)は絶対配置です
//   (バーの折り返しと行の高さに影響しない)。入りきらないときは端から切れ、title で全文を出します。
export function GridSelectionAggregates({
  aggregates,
  trailing,
}: {
  aggregates: GridSelectionAggregatesValue | null | undefined;
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