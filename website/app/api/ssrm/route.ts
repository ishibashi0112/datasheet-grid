// SSRM デモの読み取り API。グリッドの dataSource.getRows から呼ばれる。
// latencyMs / fail はデモ用のシミュレーションパラメータ(クライアントのトグルで指定)。
import { applyQuery, getDataset } from '@/lib/ssrm-data';
import type { ServerSideQuery } from '@ishibashi0112/spreadsheet-grid';

type Body = {
  startIndex: number;
  endIndex: number;
  query?: ServerSideQuery;
  latencyMs?: number;
  fail?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;

  const latency = Math.min(Math.max(body.latencyMs ?? 0, 0), 5000);
  if (latency > 0) {
    await new Promise((resolve) => setTimeout(resolve, latency));
  }
  if (body.fail) {
    return Response.json(
      { message: '(デモ)シミュレートされた取得失敗' },
      { status: 500 },
    );
  }

  const filtered = applyQuery(getDataset(), body.query);
  const startIndex = Math.max(0, Math.floor(body.startIndex));
  const endIndex = Math.max(startIndex, Math.floor(body.endIndex));

  return Response.json({
    rows: filtered.slice(startIndex, endIndex),
    totalRowCount: filtered.length,
  });
}