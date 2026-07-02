// Google Cloud TTS クライアント + Blob URL 管理

export async function fetchTtsAudio(
  text: string,
  lang: "en" | "ja",
  rate: number
): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, rate }),
  });

  if (!res.ok) {
    throw new Error(`TTS failed: ${res.status} ${res.statusText}`);
  }

  const { audioContent } = (await res.json()) as { audioContent: string };
  const binary = atob(audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "audio/mp3" });
}

export async function playTtsAudio(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      void audio.play().catch((e) => {
        URL.revokeObjectURL(url);
        reject(e);
      });
    } catch (e) {
      reject(e);
    }
  });
}
