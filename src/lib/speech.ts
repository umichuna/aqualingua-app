// Web Speech API 音声合成 + Wake Lock（設計書 v2.2 §4.2 準拠）

export function speak(
  text: string,
  lang: "en-US" | "ja-JP" = "en-US",
  rate = 1.0
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// ---------- Wake Lock（聞き流し中のスリープ防止） ----------
let wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("Wake Lock request failed:", err);
  }
}

export function releaseWakeLock(): void {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}
