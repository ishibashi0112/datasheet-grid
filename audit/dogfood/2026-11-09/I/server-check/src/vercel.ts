import { generateText, jsonSchema, Output } from 'ai';

// AI Gateway のキーは AI_GATEWAY_API_KEY(Vercel にデプロイしたものは自動で認証される)
export async function POST(req: Request) {
  // ここでログインしているか・呼ぶ回数を確かめる
  const { system, prompt, schema } = await req.json();
  const { output } = await generateText({
    // 'openai/…' や 'google/…' のモデルに替えるだけで、ほかの会社の AI に切り替わる
    model: 'anthropic/claude-haiku-5.5',
    reasoning: 'low',
    system,
    prompt,
    output: Output.object({ schema: jsonSchema(schema) }),
  });
  return Response.json(output);
}
