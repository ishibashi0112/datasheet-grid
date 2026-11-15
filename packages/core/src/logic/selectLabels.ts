// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-08): select 列の表示名(label)と値(value)の読み替えと、コピー / エクスポートの
//   セルの文字です。
//
// 背景: 値と表示名が別の select 列(value 'transport' / label '交通費')で、Excel から表示名の「交通費」を貼り付けると、
//   文字列「交通費」がそのまま値に入り(印も出ない)、set フィルター・CSV・データの中身がそろわなくなっていました。コピーと
//   CSV はコードのまま出るので、formatClipboardValue と parseClipboardValue を自分で書く必要がありました。
//   select エディタに `clipboard: 'label'` を書くと、コピー / CSV / getExportData の text は label、貼り付けた文字が label なら
//   その value へ読み替えます(value はそのまま通す。どちらでもない文字は生のまま = 1.0 と同じ)。既定('value')は 1.0 と同じ。
//   列の formatClipboardValue / parseClipboardValue があればそちらが勝ちます。
import type { GridColumn, GridSelectEditorOption } from '../model/gridTypes.unbound';

type SelectLabelLookup = {
  size: number;
  labelByValue: Map<string, string>;
  valueByLabel: Map<string, string>;
};

// 候補の配列ごとの読み替えの表です(同じ配列なら作り直さない。同じ value / label が 2 つあれば先の候補)。
// 変更(1.1.0 / AP-08 の見直し): 同じ配列へ後から候補を足した(push)ときも作り直します(候補の数で見る)。label は前後の空白を
//   外した文字で引きます(貼り付けた文字も外して比べるため)。空の label は貼り付けの読み替えに使いません(空は消す)。
const lookups = /* @__PURE__ */ new WeakMap<readonly GridSelectEditorOption[], SelectLabelLookup>();

const lookupOf = (options: readonly GridSelectEditorOption[]): SelectLabelLookup => {
  let lookup = lookups.get(options);
  if (!lookup || lookup.size !== options.length) {
    lookup = { size: options.length, labelByValue: new Map(), valueByLabel: new Map() };
    for (const option of options) {
      if (!lookup.labelByValue.has(option.value)) {
        lookup.labelByValue.set(option.value, option.label);
      }
      const label = option.label.trim();
      if (label !== '' && !lookup.valueByLabel.has(label)) {
        lookup.valueByLabel.set(label, option.value);
      }
    }
    lookups.set(options, lookup);
  }
  return lookup;
};

// `clipboard: 'label'` の select 列の候補です(それ以外の列 / 行に依る候補で行が無いときは undefined)。
const labelOptionsOf = <T,>(column: GridColumn<T>, row: T | undefined): readonly GridSelectEditorOption[] | undefined => {
  const editor = column.editor;
  if (editor?.type !== 'select' || editor.clipboard !== 'label') {
    return undefined;
  }
  if (typeof editor.options !== 'function') {
    return Array.isArray(editor.options) ? editor.options : undefined;
  }
  if (row === undefined) {
    return undefined;
  }
  const options = editor.options(row);
  return Array.isArray(options) ? options : undefined;
};

// コピー / CSV / getExportData の text の 1 セルの文字です。列の formatClipboardValue があればその返り値(行があるとき)、
//   `clipboard: 'label'` の select 列なら値の label(候補に無い値は値の文字)、ほかは値の文字(null / undefined は '')。
export const formatCellClipboardText = <T,>(column: GridColumn<T>, value: unknown, row: T | undefined): string => {
  if (column.formatClipboardValue && row !== undefined) {
    return column.formatClipboardValue(value, row);
  }
  const text = String(value ?? '');
  const options = labelOptionsOf(column, row);
  return options === undefined ? text : (lookupOf(options).labelByValue.get(text) ?? text);
};

// `clipboard: 'label'` の select 列の既定のパーサです(それ以外の列は undefined)。貼り付けた文字が候補の label ならその value
//   (前後の空白は外して比べる)、value ならそのまま、どちらでもなければ生のまま。
// 変更(1.1.0 / AP-08 の見直し): label を先に見ます(ある候補の label が別の候補の value と同じ文字のとき、表の中でコピーして
//   貼り付けると別の値になっていた。この列のコピーは label を出すので、label として読む)。
export const resolveSelectLabelParser = <T,>(column: GridColumn<T>): ((raw: string, row: T) => unknown) | undefined => {
  const editor = column.editor;
  if (editor?.type !== 'select' || editor.clipboard !== 'label') {
    return undefined;
  }
  return (raw, row) => {
    const options = labelOptionsOf(column, row);
    if (options === undefined) {
      return raw;
    }
    const lookup = lookupOf(options);
    const trimmed = raw.trim();
    const byLabel = lookup.valueByLabel.get(trimmed);
    if (byLabel !== undefined) {
      return byLabel;
    }
    if (lookup.labelByValue.has(raw)) {
      return raw;
    }
    return lookup.labelByValue.has(trimmed) ? trimmed : raw;
  };
};