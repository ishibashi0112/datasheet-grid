import type { GridColumn, GridExportData } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// 追加(imperative API: getExportData): エクスポート用「整形済みデータ」の純ロジックです。ハンドル
//   (SpreadsheetGridHandle の getExportData)から呼ばれ、DOM や副作用には一切触れません(列メタ +
//   2 次元セル配列を返すだけ)。xlsx 等の生成はライブラリを同梱せず consumer 側に委ね、ここでは
//   「現在の表(フィルター/ソート/可視列/固定順/scope 反映後)」をシリアライズ非依存のデータとして
//   渡します(導線)。consumer は exceljs / hucre / SheetJS など任意のライブラリへ流し込みます。
//   値整形は CSV と同じ規則に揃えます: 各セルは生値 value(getCellValue)と文字列 text の双方を持ち、
//   text は formatClipboardValue があればそれ、無ければ String(value ?? '')。生値 value があることで、
//   consumer は数値を数値・日付を日付のまま型付きセルとして書け、Excel 側の数値書式を効かせられます。

export type BuildGridExportDataParams<T> = {
  // 行モデルシーム。viewIndex の行を引きます(SSRM 未ロード行は undefined → スキップ)。
  getRow: (viewIndex: number) => T;
  // 出力対象のビュー行レンジ [startRow, endRow)(end 排他)です。
  startRow: number;
  endRow: number;
  // 出力対象の列(視覚順 = orderedColumns の部分集合)です。columns / 各行セルの順序もこの配列順です。
  columns: GridColumn<T>[];
};

// 行レンジ × 列集合から、列メタ(key / title)と 2 次元セル(value / text)を生成します。
export const buildGridExportData = <T,>({
  getRow,
  startRow,
  endRow,
  columns,
}: BuildGridExportDataParams<T>): GridExportData => {
  // 列メタは key(オブジェクト系ライブラリ用)と title(ヘッダー表示用)の双方を持たせます。
  const exportColumns = columns.map((column) => ({
    key: column.key,
    title: column.title ?? column.key,
  }));

  const rows: GridExportData['rows'] = [];
  for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
    const row = getRow(rowIndex);
    // SSRM 未ロード行(undefined)はスキップします。clientSide では常に行が存在します。
    if (!row) {
      continue;
    }
    rows.push(
      columns.map((column) => {
        const value = getCellValue(row, column);
        const text = column.formatClipboardValue
          ? column.formatClipboardValue(value, row)
          : String(value ?? '');
        return { value, text };
      }),
    );
  }

  return { columns: exportColumns, rows };
};