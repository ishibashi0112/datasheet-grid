import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY はサーバーの環境変数

export async function POST(req: Request) {
  // ここでログインしているか・呼ぶ回数を確かめる
  const { system, prompt, schema } = (await req.json()) as { system: string; prompt: string; schema: Record<string, unknown>; text: string };
  const message = await anthropic.messages.create({
    model: 'claude-haiku-5-5', // 小さく速いモデルで足りる
    max_tokens: 4096, // 考える分(thinking)も含む上限
    system,
    messages: [{ role: 'user', content: prompt }],
    // effort: 'low' で考える量を減らして速く答えさせる。format で答えを schema の形に固定する。
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  });
  // 答えの文字列をそのまま返す(読んで検査するのはバー側。途中で切れた答えも「読めませんでした」になる)。
  const text = message.content.find((block) => block.type === 'text');
  return Response.json(text ? text.text : null);
}
