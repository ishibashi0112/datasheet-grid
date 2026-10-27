'use client';

// ことばで絞り込み(/ai)のデモ: GridAskBar を在庫表の上に置く。AI は呼ばず、例の文ごとに見本の答え(この表で Claude に
//   実際に聞いて記録したもの。ai-filter-demo-data.ts)を ask が返す(答えの検査・反映・チップ・元に戻すは本物の部品)。
//   自由な文には「例の文だけに答える」とひとことで返す。下の「AI に渡した頼みと答え」で、ask に渡る中身(行のデータは
//   入らない)と答えを見られる。
import { useMemo, useRef, useState } from 'react';
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar, type GridAsk, type GridAskRequest } from '@ishibashi0112/spreadsheet-grid/ai';
import '@ishibashi0112/spreadsheet-grid/style.css';
import { EXAMPLE_TEXTS, columnHints, createRows, initialColumns, replayAnswer, type Item } from './ai-filter-demo-data';

const OUT_OF_SCRIPT = {
  mode: 'refine',
  filters: [],
  sort: null,
  search: null,
  hide: [],
  show: [],
  unsupported: 'このデモは例の文だけに答えます(記録した見本の答え)。自分のサーバーで AI を呼ぶと、好きな文で絞り込めます。',
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export function AiFilterDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Item>>(null);
  const rows = useMemo(createRows, []);
  const [columns, setColumns] = useState(initialColumns);
  const [lastRequest, setLastRequest] = useState<GridAskRequest | null>(null);
  const [lastAnswer, setLastAnswer] = useState<unknown>(null);

  // 本物では自分のサーバーへ送る(ガイドの「サーバー側」)。デモは見本の答えを返す。
  const ask: GridAsk = async (request, { signal }) => {
    setLastRequest(request);
    await wait(450, signal);
    const result = replayAnswer(request.text, new Date()) ?? OUT_OF_SCRIPT;
    setLastAnswer(result);
    return result;
  };

  return (
    <div className="not-prose flex flex-col gap-3">
      <GridAskBar
        grid={gridRef}
        columns={columns}
        ask={ask}
        examples={EXAMPLE_TEXTS}
        columnHints={columnHints}
        allowColumnVisibility
        theme="auto"
      />
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={columns}
        onColumnsChange={setColumns}
        rowKeyGetter={(row) => row.code}
        height={360}
        theme="auto"
      />
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">AI に渡した頼みと答え</summary>
        {lastRequest ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-fd-muted-foreground">
              ask(request) に渡る中身です。system はいつも同じ文、prompt は列の説明と今の条件と利用者の文、schema は答えの形(JSON
              Schema)。行のデータは入りません。
            </p>
            <pre className="max-h-72 overflow-auto rounded bg-fd-muted p-2 text-xs whitespace-pre-wrap">
              {`// prompt\n${lastRequest.prompt}\n\n// 答え\n${JSON.stringify(lastAnswer, null, 2)}`}
            </pre>
          </div>
        ) : (
          <p className="mt-2 text-fd-muted-foreground">例の文を押すと、ここに AI へ渡す中身と答えが出ます。</p>
        )}
      </details>
    </div>
  );
}