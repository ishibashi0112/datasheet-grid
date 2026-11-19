// 既定の下部バー(DefaultGridBottomBar)に出す選択範囲の集計(機能 features/selectionAggregates の部品)。React 版の
//   view/GridSelectionAggregates.tsx と同じ DOM と class。Excel のステータスバーと同じ「平均 / データの個数 / 合計」を並べます。
//   数値が 1 つも無い(文字だけ)ときは「データの個数」だけ、空のセルだけのときは何も出しません。大きな選択の計算中は
//   「集計中…」と進み具合。入りきらないときは項目を途中で切らずに丸ごと隠します(右から詰めて折り返す一覧の 2 行目以降を
//   見せない。並べ方と区切り線の置き方は React 版の説明のとおり)。
import { For, Show, createMemo } from 'solid-js';
import type { GridSelectionAggregates as GridSelectionAggregatesValue } from '@ishibashi0112/spreadsheet-grid-core';
import { formatSelectionAggregateNumber } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { DEFAULT_AGGREGATES_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { useFeatureLocaleText } from '../context/localeText';

type AggregateChip = { key: string; text: string; label?: string; value?: string; muted?: boolean };

export function GridSelectionAggregates(props: {
  aggregates: GridSelectionAggregatesValue | null | undefined;
  // 右のグループの後ろ(件数なし)なら true: 区切り線を先頭に、中身を左寄せにする。
  trailing: boolean;
}) {
  const texts = useFeatureLocaleText<typeof DEFAULT_AGGREGATES_LOCALE_TEXT>();
  // 出す項目(null = 何も出さない)。
  const chips = createMemo((): AggregateChip[] | null => {
    const aggregates = props.aggregates;
    if (!aggregates) {
      return null;
    }
    const localeTexts = texts();
    if (aggregates.status === 'computing') {
      return [
        {
          key: 'computing',
          text: formatLocaleText(localeTexts.aggregateComputing, { percent: Math.floor(aggregates.progress * 100) }),
        },
      ];
    }
    if (aggregates.count === 0) {
      return null;
    }
    const list: AggregateChip[] = [];
    if (aggregates.average !== undefined) {
      const value = formatSelectionAggregateNumber(aggregates.average);
      list.push({ key: 'average', text: `${localeTexts.aggregateAverage}: ${value}`, label: `${localeTexts.aggregateAverage}:`, value });
    }
    const count = formatSelectionAggregateNumber(aggregates.count);
    list.push({ key: 'count', text: `${localeTexts.aggregateCount}: ${count}`, label: `${localeTexts.aggregateCount}:`, value: count });
    if (aggregates.sum !== undefined) {
      const value = formatSelectionAggregateNumber(aggregates.sum);
      list.push({ key: 'sum', text: `${localeTexts.aggregateSum}: ${value}`, label: `${localeTexts.aggregateSum}:`, value });
    }
    if (aggregates.partial) {
      list.push({ key: 'partial', text: localeTexts.aggregatePartial, muted: true });
    }
    return list;
  });
  return (
    <Show when={chips()}>
      {(list) => (
        <div class={['ssg-bar-aggregates', { 'ssg-bar-aggregates--trailing': props.trailing }]}>
          <div class="ssg-bar-aggregates-inner" title={list().map((chip) => chip.text).join('  ')}>
            <div class="ssg-bar-aggregates-list">
              <span class="ssg-bar-aggregates-fit" aria-hidden="true" />
              <For each={list()} keyed={(chip) => chip.key}>
                {(chip, index) => (
                  <span
                    class={[
                      'ssg-bar-chip',
                      {
                        'ssg-bar-chip--muted': chip().muted === true,
                        'ssg-bar-aggregates-sep': index() === list().length - 1,
                      },
                    ]}
                    style={{ order: String(-index()) }}
                  >
                    <Show when={chip().label !== undefined} fallback={chip().text}>
                      {chip().label}
                      <b class="ssg-bar-aggregate-value">{chip().value}</b>
                    </Show>
                  </span>
                )}
              </For>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}