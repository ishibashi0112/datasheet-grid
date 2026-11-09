import OpenAI from 'openai';

const openai = new OpenAI(); // OPENAI_API_KEY はサーバーの環境変数

export async function POST(req: Request) {
  // ここでログインしているか・呼ぶ回数を確かめる
  const { system, prompt, schema } = (await req.json()) as { system: string; prompt: string; schema: Record<string, unknown>; text: string };
  const response = await openai.responses.create({
    model: 'gpt-6-luna', // 小さく速いモデルで足りる
    instructions: system,
    input: prompt,
    // strict: true で答えを schema の形に固定する
    text: { format: { type: 'json_schema', name: 'grid_view', schema, strict: true } },
  });
  return Response.json(response.output_text);
}
