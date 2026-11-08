'use client';

// 英語の文言のデモ: 日本語(既定)と英語(localeTextEn)を切り替える。グリッドが自分で出す文言(上下のバー・列メニュー・
//   列フィルター・ツールパネル・検索バー・合計行・選択範囲の集計・組み込みの検査のメッセージ・読み上げの名前)が変わる。
//   列の見出しと値は利用側のデータなので、デモの中で言語ごとに用意している。
import { useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type GridLocaleText,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Lang = 'ja' | 'en';

type Row = {
  id: number;
  code: string;
  category: string;
  qty: number;
  price: number;
  due: string;
};

const CATEGORIES: Record<Lang, string[]> = {
  ja: ['部品', '消耗品', '工具'],
  en: ['Parts', 'Supplies', 'Tools'],
};

const TITLES: Record<Lang, Record<'code' | 'category' | 'qty' | 'price' | 'due', string>> = {
  ja: { code: '品番', category: '区分', qty: '数量', price: '単価', due: '納期' },
  en: { code: 'Part no.', category: 'Category', qty: 'Qty', price: 'Unit price', due: 'Due' },
};

const yen = numberFormatter<Row>({ maximumFractionDigits: 0 });

const buildRows = (lang: Lang): Row[] =>
  Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    code: `P-${String(1001 + i)}`,
    category: CATEGORIES[lang][(i * 7) % 3],
    // 17 行に 1 つ、検査(0 以上の整数)に引っかかる値を入れておく(セルに印が付き、ツールチップに検査のメッセージ)。
    qty: i % 17 === 5 ? -2 : ((i * 13) % 40) + 1,
    price: ((i * 37) % 90) * 100 + 300,
    due: `2026-${String((i % 9) + 3).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
  }));

const buildColumns = (lang: Lang): GridColumn<Row>[] => [
  { key: 'code', title: TITLES[lang].code, width: 110, pinned: 'left', filterType: 'text', aggFunc: 'count' },
  { key: 'category', title: TITLES[lang].category, width: 120, filterType: 'set' },
  {
    key: 'qty',
    title: TITLES[lang].qty,
    width: 90,
    align: 'right',
    filterType: 'number',
    aggFunc: 'sum',
    editor: { type: 'number', min: 0, integer: true },
  },
  { key: 'price', title: TITLES[lang].price, width: 110, align: 'right', filterType: 'number', aggFunc: 'avg', valueFormatter: yen },
  { key: 'due', title: TITLES[lang].due, width: 120, filterType: 'dateSet' },
];

const LOCALE_TEXT: Record<Lang, Partial<GridLocaleText> | undefined> = {
  ja: undefined,
  en: localeTextEn,
};

export function LocaleDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const [lang, setLang] = useState<Lang>('en');
  const columns = useMemo(() => buildColumns(lang), [lang]);
  const [rowsByLang, setRowsByLang] = useState<Record<Lang, Row[]>>(() => ({ ja: buildRows('ja'), en: buildRows('en') }));

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div role="radiogroup" aria-label="言語" className="flex overflow-hidden rounded border">
          {(['ja', 'en'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={lang === value}
              className={`px-3 py-1 ${lang === value ? 'bg-fd-primary text-fd-primary-foreground' : ''}`}
              onClick={() => setLang(value)}
            >
              {value === 'ja' ? '日本語(既定)' : 'English(localeTextEn)'}
            </button>
          ))}
        </div>
        <button type="button" className="rounded border px-2 py-1" onClick={() => gridRef.current?.openFind()}>
          {lang === 'ja' ? '検索バーを開く' : 'Open find'}
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => gridRef.current?.openFilterManager()}>
          {lang === 'ja' ? 'ツールパネルを開く' : 'Open tool panel'}
        </button>
      </div>
      <SpreadsheetGrid
        // 言語を変えたら作り直す(選択や開いているメニューを前の言語のまま残さない)。
        key={lang}
        ref={gridRef}
        rows={rowsByLang[lang]}
        columns={columns}
        onRowsChange={(next) => setRowsByLang((current) => ({ ...current, [lang]: next }))}
        rowKeyGetter={(row) => row.id}
        height={380}
        theme="class"
        localeText={LOCALE_TEXT[lang]}
        enableGlobalFilter
        showFilterChipBar
        find
        totalRow
        fillHandle
        initialState={{ sort: [{ columnKey: 'price', direction: 'desc' }] }}
      />
    </div>
  );
}