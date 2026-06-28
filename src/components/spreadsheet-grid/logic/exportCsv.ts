import type { GridColumn } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// 追加(imperative API #1): CSV エクスポートの純ロジックです。ハンドル(SpreadsheetGridHandle の
//   exportCsv / downloadCsv)から呼ばれ、DOM や副作用には一切触れません(文字列を返すだけ)。
//   値整形は既存のコピー(クリップボード)と同じ規則に揃えます: getCellValue → formatClipboardValue
//   があればそれ、無ければ String(value ?? '')。表示用 valueFormatter ではなくデータ寄りの
//   formatClipboardValue を使うことで、コピーとエクスポートの内容が一致します。

// RFC 4180 準拠のフィールドエスケープです。区切り文字 / ダブルクォート / 改行(CR or LF)を含む
//   フィールドのみ "..." で囲み、内部の " は "" へ二重化します。
const escapeCsvField = (value: string, delimiter: string): string => {
  const needsQuote =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');
  if (!needsQuote) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
};

// セル 1 個ぶんのエクスポート文字列を、コピーと同じ規則で求めます。
const exportCellText = <T,>(row: T, column: GridColumn<T>): string => {
  const raw = getCellValue(row, column);
  return column.formatClipboardValue
    ? column.formatClipboardValue(raw, row)
    : String(raw ?? '');
};

export type SerializeRowsToCsvParams<T> = {
  // 行モデルシーム。viewIndex の行を引きます(SSRM 未ロード行は undefined → スキップ)。
  getRow: (viewIndex: number) => T;
  // 出力対象のビュー行レンジ [startRow, endRow)(end 排他)です。
  startRow: number;
  endRow: number;
  // 出力対象の列(視覚順 = orderedColumns の部分集合)です。ヘッダー / 各セルの順序もこの配列順です。
  columns: GridColumn<T>[];
  // 区切り文字(既定 ',')です。
  delimiter?: string;
  // 先頭にヘッダー行(列タイトル)を付けるか(既定 true)です。
  includeHeaders?: boolean;
  // 先頭に UTF-8 BOM を付けるか(既定 false)です。Excel での文字化けを防ぎたいとき true にします。
  bom?: boolean;
};

// 行レンジ × 列集合から CSV 文字列を生成します。行区切りは RFC 4180 に従い CRLF です。
export const serializeRowsToCsv = <T,>({
  getRow,
  startRow,
  endRow,
  columns,
  delimiter = ',',
  includeHeaders = true,
  bom = false,
}: SerializeRowsToCsvParams<T>): string => {
  const lines: string[] = [];

  if (includeHeaders) {
    lines.push(
      columns
        .map((column) => escapeCsvField(column.title ?? column.key, delimiter))
        .join(delimiter),
    );
  }

  for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
    const row = getRow(rowIndex);
    // SSRM 未ロード行(undefined)はスキップします。clientSide では常に行が存在します。
    if (!row) {
      continue;
    }
    const cells = columns.map((column) =>
      escapeCsvField(exportCellText(row, column), delimiter),
    );
    lines.push(cells.join(delimiter));
  }

  const body = lines.join('\r\n');
  return bom ? `\uFEFF${body}` : body;
};