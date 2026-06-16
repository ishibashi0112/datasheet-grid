import { useState } from 'react';
import SpreadsheetGrid from './components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn } from './components/spreadsheet-grid/model/gridTypes';

// 追加: デモ用の行型です。
type DemoRow = {
  partNo: string;
  partName: string;
  qty: number;
  unit: string;
  status: string;
  [key: string]: string | number;
};

// 追加: 初期ダミー行数です。UX確認用に少し多めにしています。
// 変更(DS-3-1): 5,000 → 50,000(5万)。DS-3 の rowModel 移行を Profiler で検証するための負荷増です。
//   行は virtualizer 化済みのため DOM 量は据え置き、sort/filter は order(Int32Array)全走査で数十 ms 級です。
const INITIAL_ROW_COUNT = 50000;

// 追加: 初期追加列数です。横スクロールと column virtualization 確認用です。
const INITIAL_EXTRA_COLUMN_COUNT = 24;

// 追加: オーバーフロー列のキーを生成します。
const getOverflowColumnKey = (columnIndex: number) => `extra_${columnIndex}`;

// 追加: ダミー行を生成します。
const createDemoRows = (count: number): DemoRow[] =>
  Array.from({ length: count }, (_, index) => {
    const rowNumber = index + 1;
    return {
      partNo: `A-${String(1001 + index).padStart(4, '0')}`,
      partName: `品名-${rowNumber}`,
      qty: (rowNumber % 25) + 1,
      unit: ['個', '本', '式', '枚'][index % 4],
      status: index % 11 === 0 ? '保留' : '有効',
    };
  }).map((row, index) => {
    const nextRow: DemoRow = { ...row };
    // 追加: 確認用に extra 列へダミー値を流し込みます。
    for (let extraIndex = 0; extraIndex < INITIAL_EXTRA_COLUMN_COUNT; extraIndex += 1) {
      nextRow[getOverflowColumnKey(5 + extraIndex)] = `R${index + 1}-C${extraIndex + 1}`;
    }
    return nextRow;
  });

// 追加: 基本列 + 初期追加列を生成します。
const createInitialColumns = (): GridColumn<DemoRow>[] => {
  const baseColumns: GridColumn<DemoRow>[] = [
    // 追加: text / number / select / set のフィルター型を設定します。
    // 追加(10-E): frozen columns デモ。品番・品名を左固定にします（pinned: 'left'）。
    //            これで横スクロールしても先頭 2 列が固定表示されます。
    // 変更(12-A): 品番を set フィルター(AG Grid の Set Filter 相当)にします。
    //             候補は rows から自動収集され約 50,000 件になるため、
    //             popover 内リストの仮想化 + 検索の動作確認にそのまま使えます。
    //             注記(DS-3-1): 5万行化で候補も約5万件になります。リスト UI は仮想化済みで描画は
    //             問題ありませんが、収集の全走査(getColumnSelectOptions)は DS-4 の worker 化対象です。
    { key: 'partNo', title: '品番', width: 150, filterType: 'set',
      pinned: "left"
    },
    {
      key: 'partName',
      title: '品名',
      width: 220,
      // 注記(12-A): text フィルター(部分一致 + 適用ボタン)の動作確認用に残します。
      filterType: 'text',
      pinned: "left" ,
    },
    { key: 'qty', title: '数量', width: 90, filterType: 'number' },
    {
      key: 'unit',
      title: '単位',
      width: 90,
      readOnly: true,
      // 変更(12-A): select → set へ移行します(チェックボックスで複数選択可能)。
      filterType: 'set',
      // 追加: set 候補を固定定義します(未指定なら rows から自動収集されます)。
      filterOptions: [
        { label: '個', value: '個' },
        { label: '本', value: '本' },
        { label: '式', value: '式' },
        { label: '枚', value: '枚' },
      ],
    },
    {
      key: 'status',
      title: '状態',
      width: 120,
      // 変更(12-A): select → set へ移行します。
      filterType: 'set',
      // 追加: set 候補を固定定義します。
      filterOptions: [
        { label: '有効', value: '有効' },
        { label: '保留', value: '保留' },
      ],
    },
  ];

  const extraColumns = Array.from(
    { length: INITIAL_EXTRA_COLUMN_COUNT },
    (_, index): GridColumn<DemoRow> => ({
      key: getOverflowColumnKey(5 + index),
      title: `追加列${index + 1}`,
      width: 120,
      // 追加: 追加列は text として扱います。
      filterType: 'text',
    }),
  );

  return [...baseColumns, ...extraColumns];
};

function App() {
  // 追加: ダミー行を多めに生成します。
  const [rows, setRows] = useState<DemoRow[]>(() => createDemoRows(INITIAL_ROW_COUNT));

  // 追加: 列定義も初期追加列込みで生成します。
  const [columns, setColumns] = useState<GridColumn<DemoRow>[]>(() =>
    createInitialColumns(),
  );

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 1600,
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
          SpreadsheetGrid - 実装バッチ
        </h1>

        <p
          style={{
            marginTop: 8,
            color: '#475569',
            fontSize: 14,
          }}
        >
          reducer ベースの SpreadsheetGrid です。行/列選択、copy/paste、editor、
          row virtualization / column virtualization の確認用に、
          初期行数 {INITIAL_ROW_COUNT.toLocaleString()} 行・
          初期列数 {columns.length} 列のダミーデータを表示しています。
        </p>
      </header>

      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        onColumnsChange={setColumns}
        rowKeyGetter={(row, index) => `${row.partNo || 'row'}-${index}`}
        createRow={() => ({
          partNo: '',
          partName: '',
          qty: 0,
          unit: '',
          status: '',
        })}
        createOverflowColumn={(columnIndex) => ({
          key: getOverflowColumnKey(columnIndex),
          title: `列${columnIndex + 1}`,
          width: 120,
          // 追加: 後から増える列も text フィルター対象に揃えます。
          filterType: 'text',
        })}
        rowHeight={38}
        headerHeight={42}
        rowHeaderWidth={56}
        enableRangeSelection
        enableGlobalFilter
        // 追加(10-E): frozen columns は列定義の pinned: 'left' で有効化済みです。
        //            （createInitialColumns の partNo / partName を参照）
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