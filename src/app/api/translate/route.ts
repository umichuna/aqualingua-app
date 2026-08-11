import { NextRequest, NextResponse } from "next/server";

// Azure Translator 辞書検索で英語→日本語の複数候補を取得
// POST { text: string, wordType?: "単語" | "述語" | "会話文" } → { translations: string[] }
export async function POST(req: NextRequest) {
  // 壊れたJSONが来たときに素の500にせず、理由の分かる400を返す
  let body: { text?: string; wordType?: "単語" | "述語" | "会話文" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { text, wordType } = body;
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  // 下の translateSentence が閉じ込めて使うため、絞り込み済みの値を別の const にしておく
  const trimmedText = text.trim();

  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;

  if (!key || !region || !endpoint) {
    return NextResponse.json({ error: "Azure Translator not configured" }, { status: 500 });
  }

  // 通常の文翻訳（1文まるごと訳す）。辞書検索のフォールバックと会話文の両方で使う。
  async function translateSentence(): Promise<Response> {
    const translateUrl = `${endpoint}/translate?api-version=3.0&from=en&to=ja`;
    return fetch(translateUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key!,
        "Ocp-Apim-Subscription-Region": region!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ text: trimmedText }]),
    });
  }

  try {
    // 会話文（1文の文章）は辞書検索を使わない。辞書検索は単語・短い成句向けのAPIで、
    // 長文を渡すと文中の語句をそれぞれ辞書エントリとして解釈した断片的な訳を複数返して
    // くることがあり（候補が0件にならないためフォールバックが効かない）、文が途中で
    // 分割されて別々に翻訳されたように見えるバグの原因になっていた。
    // 会話文は常に文翻訳のみを使い、結果もカンマで分割せず1文のまま返す。
    if (wordType === "会話文") {
      const transRes = await translateSentence();
      if (!transRes.ok) {
        const errText = await transRes.text();
        console.error("Azure Translator error:", errText);
        return NextResponse.json({ error: "Translation failed" }, { status: 502 });
      }
      const transData = (await transRes.json()) as Array<{
        translations: Array<{ text: string }>;
      }>;
      const translated = transData[0]?.translations[0]?.text?.trim() ?? "";
      return NextResponse.json({ translations: translated ? [translated] : [] });
    }

    // まず辞書検索（複数候補あり）を試みる
    const dictUrl = `${endpoint}/dictionary/lookup?api-version=3.0&from=en&to=ja`;
    const dictRes = await fetch(dictUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ text: trimmedText }]),
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
    const transRes = await translateSentence();

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
