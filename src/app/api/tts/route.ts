import { NextRequest, NextResponse } from "next/server";

// Google Cloud Text-to-Speech で text を音声MP3に変換
// POST { text: string; lang: "en" | "ja"; rate: number } → { audioContent: string (base64) }
export async function POST(req: NextRequest) {
  const { text, lang, rate } = (await req.json()) as {
    text: string;
    lang: "en" | "ja";
    rate: number;
  };

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (!lang || !["en", "ja"].includes(lang)) {
    return NextResponse.json({ error: "lang must be 'en' or 'ja'" }, { status: 400 });
  }

  if (typeof rate !== "number") {
    return NextResponse.json({ error: "rate must be a number" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google TTS API key not configured" }, { status: 500 });
  }

  try {
    const url = "https://texttospeech.googleapis.com/v1/text:synthesize";
    const languageCode = lang === "en" ? "en-US" : "ja-JP";
    const voiceName =
      lang === "en" ? "en-US-Neural2-F" : "ja-JP-Neural2-B";

    const body = {
      input: { text: text.trim() },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: Math.max(0.25, Math.min(4.0, rate)), // Clamp 0.25-4.0
      },
    };

    const res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Google TTS API error:", errText);
      return NextResponse.json(
        { error: "Text-to-speech generation failed" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { audioContent: string };
    return NextResponse.json({ audioContent: data.audioContent });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Network error" }, { status: 500 });
  }
}
