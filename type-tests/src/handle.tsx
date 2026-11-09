// ref ハンドルと props の型。React 18(forwardRef で包む)と 19(ref を prop で受ける)の両方の型で通ることを確かめます。
import { useRef } from 'react';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import type {
  CellCoord,
  GridCellEventParams,
  GridExportData,
  GridSelection,
  GridState,
  GridStatePatch,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid';
import { assertType, type Equal } from './expect.js';

type Row = { id: string; name: string; qty: number };

export function Inventory({ rows }: { rows: Row[] }) {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  const save = () => {
    const handle = ref.current;
    if (!handle) return;
    const state = handle.getState();
    assertType<Equal<typeof state, GridState>>();
    const patch: GridStatePatch = { filters: { globalText: 'abc' } };
    handle.applyState(patch);
    handle.applyState(state);
    const selection = handle.getSelection();
    assertType<Equal<typeof selection, GridSelection>>();
    const active = handle.getActiveCell();
    assertType<Equal<typeof active, CellCoord | null>>();
    const data = handle.getExportData({ scope: 'view' });
    assertType<Equal<typeof data, GridExportData>>();
    const rowsSelected = handle.getSelectedRowData();
    assertType<Equal<typeof rowsSelected, Row[]>>();
    handle.scrollToRow(0, { align: 'center' });
    handle.focus();
    // @ts-expect-error 無いメソッド
    handle.scrollToEnd();
  };
  const onCellClick: SpreadsheetGridProps<Row>['onCellClick'] = (params) => {
    assertType<Equal<typeof params, GridCellEventParams<Row>>>();
    assertType<Equal<typeof params.row, Row>>();
    assertType<Equal<typeof params.event, MouseEvent>>();
  };
  return (
    <>
      <button onClick={save}>save</button>
      <SpreadsheetGrid
        ref={ref}
        rows={rows}
        columns={[{ key: 'name', width: 120 }]}
        rowKeyGetter={(row) => {
          assertType<Equal<typeof row, Row>>();
          return row.id;
        }}
        onCellClick={onCellClick}
        onRowsChange={(next) => {
          assertType<Equal<typeof next, Row[]>>();
        }}
      />
      {/* @ts-expect-error rows と columns の行の型が合わない */}
      <SpreadsheetGrid<Row> rows={[{ id: 1 }]} columns={[]} />
    </>
  );
}