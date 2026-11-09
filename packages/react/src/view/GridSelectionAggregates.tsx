// 追加(選択範囲の集計)/ 変更(差し込み式 段階 2): 既定の下部バー(DefaultGridBottomBar)に出す選択範囲の集計です。
//   DefaultGridBottomBar から移しただけで中身は同じです(機能 features/selectionAggregates の部品)。
import type { GridSelectionAggregates as GridSelectionAggregatesValue } from '../model/gridTypes';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { formatSelectionAggregateNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates';
import {
  formatLocaleText,
  type FeatureLocaleText,
  type ResolvedGridLocaleText,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
// 追加(英語対応): 選択範囲の集計の機能だけが使う文言(既定は localeTextAggregates.ts。機能の localeText でシェルが埋める)。
import type { DEFAULT_AGGREGATES_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';

// 追加(選択範囲の集計): Excel のステータスバーと同じ「平均 / データの個数 / 合計」を並べます。
//   数値が 1 つも無い(文字だけ)ときは「データの個数」だけ、空のセルだけのときは何も出しません。
//   大きな選択の計算中は「集計中…」と進捗、SSRM で未読み込みの行を飛ばしたときは「読み込み済みの行のみ」を添えます。
//   外側(.ssg-bar-aggregates)は幅 0 から空きを埋める要素で、中身(.ssg-bar-aggregates-inner)は絶対配置です
//   (バーの折り返しと行の高さに影響しない)。title で全文を出します。
//   変更(1.0.1 / 2026-11-09 実アプリの総点検 AP-28): 入りきらないときは、項目を途中で切らずに丸ごと隠します(先頭の「平均」
//   から)。これまでは端から切っていたので、「平均: 3,029,250」の「平均: 3,02」が隠れて「9,250」が平均に読めた。
//   一覧(.ssg-bar-aggregates-list)は右から詰めて折り返す flex(row-reverse + wrap)で、2 行目以降は見せません。
//   項目は order で逆順に並べ(右から 合計 → データの個数 → 平均)、読み上げの順(DOM の順)は左からのままです。
//   1 行目の先頭(右端)に幅 0 の目印を置くので、1 つも入らない幅では項目がすべて 2 行目へ回って何も出ません
//   (flex は行の最初の項目だけは入らなくても置くため。目印が無いと入らない項目が 1 行目に残って切れる)。
export function GridSelectionAggregates({
  aggregates,
  trailing,
  localeTexts: localeTextsInput,
}: {
  aggregates: GridSelectionAggregatesValue | null | undefined;
  // 右グループの後ろ(件数なし)なら true: 区切り線を先頭に、中身を左寄せにします。
  trailing: boolean;
  // 追加(段階 2 DU-18): 文言。変更(英語対応の見直し): 必須に(集計の文言は機能の表にあり、本体の既定には無いため。
  //   シェルが機能の文言を重ねたものを渡す)。
  localeTexts: ResolvedGridLocaleText;
}) {
  if (!aggregates) {
    return null;
  }
  const localeTexts = localeTextsInput as FeatureLocaleText<typeof DEFAULT_AGGREGATES_LOCALE_TEXT>;
  const chips: { key: string; text: string; label?: string; value?: string; muted?: boolean }[] = [];
  if (aggregates.status === 'computing') {
    chips.push({
      key: 'computing',
      text: formatLocaleText(localeTexts.aggregateComputing, { percent: Math.floor(aggregates.progress * 100) }),
    });
  } else {
    if (aggregates.count === 0) {
      return null;
    }
    if (aggregates.average !== undefined) {
      const value = formatSelectionAggregateNumber(aggregates.average);
      chips.push({ key: 'average', text: `${localeTexts.aggregateAverage}: ${value}`, label: `${localeTexts.aggregateAverage}:`, value });
    }
    const count = formatSelectionAggregateNumber(aggregates.count);
    chips.push({ key: 'count', text: `${localeTexts.aggregateCount}: ${count}`, label: `${localeTexts.aggregateCount}:`, value: count });
    if (aggregates.sum !== undefined) {
      const value = formatSelectionAggregateNumber(aggregates.sum);
      chips.push({ key: 'sum', text: `${localeTexts.aggregateSum}: ${value}`, label: `${localeTexts.aggregateSum}:`, value });
    }
    if (aggregates.partial) {
      chips.push({ key: 'partial', text: localeTexts.aggregatePartial, muted: true });
    }
  }
  const separator = <span className="ssg-bar-sep" aria-hidden="true" />;
  return (
    <div className={cx('ssg-bar-aggregates', trailing && 'ssg-bar-aggregates--trailing')}>
      <div className="ssg-bar-aggregates-inner" title={chips.map((chip) => chip.text).join('  ')}>
        {trailing ? separator : null}
        <div className="ssg-bar-aggregates-list">
          <span className="ssg-bar-aggregates-fit" aria-hidden="true" />
          {chips.map((chip, index) => (
            <span
              key={chip.key}
              className={cx('ssg-bar-chip', chip.muted && 'ssg-bar-chip--muted')}
              style={{ order: -index }}
            >
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
        </div>
        {trailing ? null : separator}
      </div>
    </div>
  );
}