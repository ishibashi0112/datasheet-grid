import { GoogleGenAI } from '@google/genai';

const gemini = new GoogleGenAI({}); // GEMINI_API_KEY はサーバーの環境変数

export async function POST(req: Request) {
  // ここでログインしているか・呼ぶ回数を確かめる
  const { system, prompt, schema } = (await req.json()) as { system: string; prompt: string; schema: Record<string, unknown>; text: string };
  const response = await gemini.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      systemInstruction: system,
      // 答えを schema の形の JSON に固定する
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    },
  });
  return Response.json(response.text ?? null);
}
