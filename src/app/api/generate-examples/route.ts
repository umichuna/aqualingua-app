import { NextRequest, NextResponse } from "next/server";

// Gemini API で例文生成（無料枠）
// POST { spelling: string, meanings: string[] } → { examples: { sentence: string; translation: string }[] }
export async function POST(req: NextRequest) {
  // 壊れたJSONが来たときに素の500にせず、理由の分かる400を返す。
  // 文字列 "null" はパースに成功して null になるため、オブジェクトかどうかも確かめる
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null) {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { spelling, meanings } = parsed as { spelling?: string; meanings?: string[] };

  if (!spelling?.trim()) {
    return NextResponse.json({ error: "spelling is required" }, { status: 400 });
  }

  // meanings が未送信・配列以外でも落ちないようにする（try の外で参照するため）
  const meaningList = Array.isArray(meanings) ? meanings.filter((m) => typeof m === "string" && m.trim()) : [];

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Gemini API not configured" }, { status: 503 });
  }

  const meaningsText = meaningList.length > 0 ? meaningList.join("、") : spelling;

  const prompt = `You are an English teacher creating example sentences for vocabulary learning.
Create exactly 3 natural example sentences using the word/phrase "${spelling}" (Japanese meanings: ${meaningsText}).
Respond ONLY with valid JSON array, no explanation:
[
  {"sentence": "English sentence 1.", "translation": "日本語訳1"},
  {"sentence": "English sentence 2.", "translation": "日本語訳2"},
  {"sentence": "English sentence 3.", "translation": "日本語訳3"}
]`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json({ error: `Gemini error ${res.status}: ${errText}` }, { status: 502 });
    }

    const data = (await res.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
    };

    const content = data.candidates[0]?.content?.parts[0]?.text ?? "[]";
    const jsonStart = content.indexOf("[");
    const jsonEnd = content.lastIndexOf("]");
    const jsonStr = jsonStart >= 0 ? content.slice(jsonStart, jsonEnd + 1) : "[]";

    const parsed = JSON.parse(jsonStr) as unknown;
    // モデルが想定外の形を返しても画面に undefined が出ないよう、形を検証して通す
    const examples = (Array.isArray(parsed) ? parsed : [])
      .filter(
        (e): e is { sentence: string; translation: string } =>
          !!e && typeof e === "object" &&
          typeof (e as { sentence?: unknown }).sentence === "string" &&
          typeof (e as { translation?: unknown }).translation === "string"
      )
      .map((e) => ({ sentence: e.sentence.trim(), translation: e.translation.trim() }))
      .filter((e) => e.sentence);

    return NextResponse.json({ examples: examples.slice(0, 3) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Network error" }, { status: 500 });
  }
}
