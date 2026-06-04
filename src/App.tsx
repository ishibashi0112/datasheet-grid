import { useMemo, useState } from 'react';
import SpreadsheetGrid from './components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn } from './components/spreadsheet-grid/model/gridTypes';

// 追加: デモ用の行型です。
type DemoRow = {
  partNo: string;
  partName: string;
  qty: number;
  unit: string;
  status: string;
};

function App() {
  // 追加: バッチ1 の動作確認用データです。
  const [rows, setRows] = useState<DemoRow[]>([
    { partNo: 'A-1001', partName: 'フレーム', qty: 2, unit: '個', status: '有効' },
    { partNo: 'A-1002', partName: 'ボルト', qty: 16, unit: '本', status: '有効' },
    { partNo: 'A-1003', partName: 'ナット', qty: 16, unit: '個', status: '有効' },
    { partNo: 'A-1004', partName: 'ワッシャー', qty: 16, unit: '個', status: '有効' },
    { partNo: 'A-1005', partName: 'カバー', qty: 1, unit: '式', status: '保留' },
    { partNo: 'A-1006', partName: 'ラベル', qty: 3, unit: '枚', status: '有効' },
  ]);

  // 追加: 列定義です。今後ここに renderCell / renderHeader を拡張していきます。
  const columns = useMemo<GridColumn<DemoRow>[]>(
    () => [
      { key: 'partNo', title: '品番', width: 150 },
      { key: 'partName', title: '品名', width: 220 },
      { key: 'qty', title: '数量', width: 90 },
      { key: 'unit', title: '単位', width: 90, readOnly: true },
      { key: 'status', title: '状態', width: 120 },
    ],
    [],
  );

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px 24px 48px',
        textAlign: 'left',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.25,
            color: '#0f172a',
          }}
        >
          SpreadsheetGrid - 実装バッチ1
        </h1>
        <p
          style={{
            marginTop: 8,
            color: '#475569',
            fontSize: 14,
          }}
        >
          reducer ベースのコア土台です。バッチ1では型 / reducer / selector / 最小描画までを実装しています。
        </p>
      </header>

      <SpreadsheetGrid<DemoRow>
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowHeight={38}
        headerHeight={42}
        rowHeaderWidth={56}
        enableRangeSelection
        enableGlobalFilter
        canEditCell={(rowIndex, _colIndex, row, column) => {
          // 追加: デモ用に「保留」行は status 列以外を編集不可とする例です。
          if (row.status === '保留' && column.key !== 'status') {
            return false;
          }

          return rowIndex >= 0;
        }}
      />
    </main>
  );
}

export default App;