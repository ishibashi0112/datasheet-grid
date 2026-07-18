// SSRM デモの書き戻し API。グリッドの dataSource.updateRows から呼ばれる。
// デモサーバはステートレスのため保存はせず、成功/失敗(fail)と遅延だけをシミュレートする
// (成功時は空のレスポンス = グリッドの楽観値をそのまま確定)。
type Body = {
  updates: unknown[];
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
      { message: '(デモ)シミュレートされた保存失敗' },
      { status: 500 },
    );
  }

  return Response.json({});
}