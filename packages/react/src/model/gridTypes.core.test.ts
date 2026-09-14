// 追加(非依存化 ①): gridTypes.core の型が React 非依存であること(束ね型 F で描画ノード / style の型が
//   決まること)と、React 束縛(gridTypes.ts)のエイリアスが core を ReactGridTypes で固定したものである
//   ことを型レベルで固定する回帰テストです。実行時アサーションは持たず、tsc(tsconfig.vitest.json)と
//   vitest の expectTypeOf で検証します。
import { describe, expectTypeOf, it } from 'vitest';
import type {
  CellRenderContext,
  CellStyleContext,
  DetailRowOptions,
  GridClassNames,
  GridColumn,
  GridContextMenuItem,
  GridFrameworkTypes,
  GridSlotProps,
  ScrollHintOptions,
  SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid-core/model/gridTypes.core';
import type {
  GridColumn as ReactGridColumn,
  GridSlotProps as ReactGridSlotProps,
  ReactGridTypes,
  SpreadsheetGridProps as ReactSpreadsheetGridProps,
} from './gridTypes';
import type { ReactNode, Ref } from 'react';
import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-core/model/gridTypes.core';

type Row = { id: number; name: string };
// React 以外のフレームワークを模した束ね型(描画ノード = 文字列、style = 文字列マップ)。
type TextFramework = { node: string; style: Record<string, string> };

describe('gridTypes.core(React 非依存の公開型)', () => {
  it('束ね型 F で描画スロットの戻り値と style の型が決まる', () => {
    expectTypeOf<TextFramework>().toMatchTypeOf<GridFrameworkTypes>();
    expectTypeOf<
      NonNullable<GridColumn<Row, TextFramework>['renderCell']>
    >().returns.toEqualTypeOf<string>();
    expectTypeOf<
      NonNullable<GridColumn<Row, TextFramework>['renderHeader']>
    >().returns.toEqualTypeOf<string>();
    expectTypeOf<DetailRowOptions<Row, TextFramework>['render']>().returns.toEqualTypeOf<string>();
    expectTypeOf<GridSlotProps<TextFramework>>().toEqualTypeOf<
      string | { className?: string; style?: Record<string, string> }
    >();
    expectTypeOf<GridClassNames<TextFramework>['bodyCell']>().toEqualTypeOf<
      GridSlotProps<TextFramework> | undefined
    >();
    expectTypeOf<
      NonNullable<ScrollHintOptions<Row, TextFramework>['renderHint']>
    >().returns.toEqualTypeOf<string>();
    expectTypeOf<
      NonNullable<SpreadsheetGridProps<Row, TextFramework>['renderTopBar']>
    >().returns.toEqualTypeOf<string>();
    expectTypeOf<
      Extract<GridContextMenuItem<TextFramework>, { kind?: 'action' }>['label']
    >().toEqualTypeOf<string>();
  });

  it('F 省略時は node = unknown(どのフレームワークにも縛られない)', () => {
    expectTypeOf<
      NonNullable<GridColumn<Row>['renderCell']>
    >().returns.toEqualTypeOf<unknown>();
    expectTypeOf<CellRenderContext<Row>['column']>().toEqualTypeOf<GridColumn<Row>>();
    expectTypeOf<CellStyleContext<Row, TextFramework>['column']>().toEqualTypeOf<
      GridColumn<Row, TextFramework>
    >();
  });

  it('core の props は React 固有の ref prop を持たない', () => {
    expectTypeOf<SpreadsheetGridProps<Row, TextFramework>>().not.toHaveProperty('ref');
  });
});

describe('gridTypes(React 束縛)', () => {
  it('公開エイリアスは core を ReactGridTypes で固定したもの(型引数の数は従来どおり 1 個)', () => {
    expectTypeOf<ReactGridColumn<Row>>().toEqualTypeOf<GridColumn<Row, ReactGridTypes>>();
    expectTypeOf<ReactGridSlotProps>().toEqualTypeOf<GridSlotProps<ReactGridTypes>>();
    expectTypeOf<
      NonNullable<ReactGridColumn<Row>['renderCell']>
    >().returns.toEqualTypeOf<ReactNode>();
  });

  it('React 版 props だけが ref prop(命令的ハンドル)を持つ', () => {
    expectTypeOf<ReactSpreadsheetGridProps<Row>['ref']>().toEqualTypeOf<
      Ref<SpreadsheetGridHandle<Row>> | undefined
    >();
  });
});