import { NextRequest, NextResponse } from "next/server";

// Azure Translator 辞書検索で英語→日本語の複数候補を取得
// POST { text: string } → { translations: string[] }
export async function POST(req: NextRequest) {
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;

  if (!key || !region || !endpoint) {
    return NextResponse.json({ error: "Azure Translator not configured" }, { status: 500 });
  }

  try {
    // まず辞書検索（複数候補あり）を試みる
    const dictUrl = `${endpoint}/dictionary/lookup?api-version=3.0&from=en&to=ja`;
    const dictRes = await fetch(dictUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ text: text.trim() }]),
    });

    if (dictRes.ok) {
      const dictData = (await dictRes.json()) as Array<{
        translations: Array<{
          displayTarget: string;
          confidence: number;
          posTag: string;
        }>;
      }>;

      const candidates = dictData[0]?.translations ?? [];
      if (candidates.length > 0) {
        // confidence 順にソートし、上位8件まで返す
        const translations = candidates
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 8)
          .map((t) => t.displayTarget)
          .filter(Boolean);
        return NextResponse.json({ translations });
      }
    }

    // 辞書に載っていない場合は通常翻訳にフォールバック
    const translateUrl = `${endpoint}/translate?api-version=3.0&from=en&to=ja`;
    const transRes = await fetch(translateUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ text: text.trim() }]),
    });

    if (!transRes.ok) {
      const errText = await transRes.text();
      console.error("Azure Translator error:", errText);
      return NextResponse.json({ error: "Translation failed" }, { status: 502 });
    }

    const transData = (await transRes.json()) as Array<{
      translations: Array<{ text: string }>;
    }>;

    const translated = transData[0]?.translations[0]?.text ?? "";
    const translations = translated
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    return NextResponse.json({ translations });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Network error" }, { status: 500 });
  }
}
