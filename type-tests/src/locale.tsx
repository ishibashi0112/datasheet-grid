// 文言(localeText): 値は文字列か、値を受け取って文字列を返す関数。英語の表は /locales/en。
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import type { GridLocaleText, GridLocaleTextTemplate } from '@ishibashi0112/spreadsheet-grid';
import { gridAskLocaleTextEn, localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import type { GridAskLocaleText } from '@ishibashi0112/spreadsheet-grid/ai';
import { assertType, expectAssignable, type Equal } from './expect.js';

assertType<Equal<typeof localeTextEn, GridLocaleText>>();
assertType<Equal<typeof gridAskLocaleTextEn, GridAskLocaleText>>();
assertType<Equal<GridLocaleText['filterExcluded'], GridLocaleTextTemplate<{ count: number }>>>();

export const custom: Partial<GridLocaleText> = {
  ...localeTextEn,
  rowCount: ({ shown, total }) => `${shown} / ${total} rows`,
  filterExcluded: 'Excluding {count}',
};
// @ts-expect-error 関数の引数の名前の間違い
expectAssignable<Partial<GridLocaleText>>({ rowCount: ({ count }: { count: number }) => String(count) });
// @ts-expect-error 無いキー
expectAssignable<Partial<GridLocaleText>>({ notAKey: 'x' });

export const englishGrid = <SpreadsheetGrid rows={[]} columns={[]} localeText={localeTextEn} />;
export const partialGrid = <SpreadsheetGrid rows={[]} columns={[]} localeText={{ noRows: 'Nothing here' }} />;