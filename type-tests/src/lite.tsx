// /lite: 機能の部品と createSpreadsheetGrid の型。機能の部品は中身の見えない GridFeature<キー> で、違うキーへは入れられません。
import { useRef } from 'react';
import {
  createSpreadsheetGrid,
  filteringFeature,
  findFeature,
  serverSideFeature,
  standardFeatures,
} from '@ishibashi0112/spreadsheet-grid/lite';
import type { GridFeature, GridFeatureName, GridFeatures, SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid/lite';
import { assertType, expectAssignable, type Equal } from './expect.js';

type Row = { id: number; name: string };

assertType<Equal<typeof findFeature, GridFeature<'find'>>>();
expectAssignable<GridFeatureName>('filtering');
// @ts-expect-error 機能セットに無いキー
expectAssignable<GridFeatureName>('charts');

// 注釈しなくても、注釈しても書ける
export const features = { ...standardFeatures, find: findFeature, serverSide: serverSideFeature };
export const annotatedFeatures: GridFeatures = { ...standardFeatures, find: findFeature };
// @ts-expect-error 部品を違うキーへ入れる
export const wrongKey: GridFeatures = { filtering: findFeature };
// @ts-expect-error 部品ではない値
export const notAFeature: GridFeatures = { find: { createFindController: () => null } };
expectAssignable<GridFeatures>({ filtering: filteringFeature });

const Grid = createSpreadsheetGrid({ features });
// @ts-expect-error features は必須
createSpreadsheetGrid({});

export function LiteGrid({ rows }: { rows: Row[] }) {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  return <Grid ref={ref} rows={rows} columns={[{ key: 'name', width: 120 }]} rowKeyGetter={(row) => row.id} find />;
}