// 効果音・BGM管理
// - 効果音は「音源素材ファイル」と「Web Audio APIによる生成音」の2本立て
// - 音の失敗（ファイルなし・自動再生制限など）でゲームが止まらないよう全処理を保護
// - ON/OFF設定は localStorage に保存（ゲームデータとは別管理なので IndexedDB に入れない）

const SFX_KEY = "aqualingua-sfx-enabled";
const BGM_KEY = "aqualingua-bgm-enabled";
const BGM_VOLUME_KEY = "aqualingua-bgm-volume";

// BGM: public/bgm.mp3 があればそちら優先、なければ音源素材の曲を使う
const BGM_SOURCES = ["/bgm.mp3", "/音源素材/さりい＿海の精霊たち.wav"];

// シーン別BGMファイルパス
export type BgmScene = "home" | "study" | "shop" | null;
const BGM_BY_SCENE: Record<NonNullable<BgmScene>, string> = {
  home: "/音源素材/さりい＿海の精霊たち.wav",
  study: "/音源素材/海底からの手紙ロング.mp3",
  shop: "/音源素材/海中世界.mp3",
};

// 水槽タイプ別BGMファイルパス
export type TankBgmType = "saltwater" | "freshwater";
const BGM_BY_TANK_TYPE: Record<TankBgmType, string> = {
  saltwater: "", // 空文字 = シーン別BGMを使う（上書きしない）
  freshwater: "/音源素材/freshwater-bgm.mp3",
};

let currentScene: BgmScene = null;
let currentTankType: TankBgmType | null = null;

// 効果音ファイル（public/音源素材/）
const SFX_FILES = {
  complete: "/音源素材/歓声と拍手1.mp3", // しごと完了
  feed: "/音源素材/食べ物をパクッ.mp3", // 餌ぱくっ
  register: "/音源素材/レジスターで精算.mp3", // 購入・出荷
} as const;

let audioCtx: AudioContext | null = null;
let bgmAudio: HTMLAudioElement | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    // ブラウザの自動再生制限で suspended になっている場合は再開を試みる
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// 効果音ファイルを再生（日本語ファイル名対応・失敗は無視）
function playFile(path: string, volume = 0.6): void {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio(encodeURI(path));
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {
    // 再生失敗は無視（ゲームを止めない）
  }
}

// ---------- 設定の読み書き ----------
export function isSfxEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SFX_KEY) !== "off"; // デフォルトON
}

export function setSfxEnabled(on: boolean): void {
  localStorage.setItem(SFX_KEY, on ? "on" : "off");
}

export function isBgmEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BGM_KEY) !== "off"; // デフォルトON
}

export function setBgmEnabled(on: boolean): void {
  localStorage.setItem(BGM_KEY, on ? "on" : "off");
  if (on) {
    void playBgm();
  } else {
    stopBgm();
  }
}

export function getBgmVolume(): number {
  if (typeof window === "undefined") return 0.3;
  const v = parseFloat(localStorage.getItem(BGM_VOLUME_KEY) ?? "0.3");
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.3;
}

export function setBgmVolume(volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  localStorage.setItem(BGM_VOLUME_KEY, String(v));
  if (bgmAudio) bgmAudio.volume = v;
}

// ---------- BGM ----------
// BGM_SOURCES を順に試して最初に再生できたものを使う
export async function playBgm(): Promise<void> {
  if (typeof window === "undefined" || !isBgmEnabled()) return;
  try {
    if (bgmAudio) {
      bgmAudio.volume = getBgmVolume();
      await bgmAudio.play();
      return;
    }
    for (const src of BGM_SOURCES) {
      try {
        const audio = new Audio(encodeURI(src));
        audio.loop = true;
        audio.volume = getBgmVolume();
        await audio.play();
        bgmAudio = audio;
        return;
      } catch {
        // 次のソースを試す
      }
    }
  } catch {
    // ファイルが無い・自動再生制限などは無視（次のタップ時に再試行される）
  }
}

export function stopBgm(): void {
  try {
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      bgmAudio = null;
    }
    currentScene = null;
  } catch {
    // 無視
  }
}

// シーン別BGM切り替え（同じシーンで既に再生中なら何もしない）
export async function playBgmForScene(scene: BgmScene): Promise<void> {
  if (typeof window === "undefined") return;
  if (scene === currentScene && bgmAudio) return; // 同じシーンで既に再生中なら何もしない
  currentScene = scene;
  currentTankType = null; // シーン別BGMに切り替わるので、タンク別BGMはクリア
  // 現在のBGMを停止
  try {
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      bgmAudio = null;
    }
  } catch {
    // 無視
  }
  if (scene === null || !isBgmEnabled()) {
    return;
  }
  const src = BGM_BY_SCENE[scene];
  const audio = new Audio(src); // encodeURI 不要（ブラウザが自動エンコード）
  audio.loop = true;
  audio.volume = getBgmVolume();
  bgmAudio = audio;
  void audio.play().catch(() => {
    // 自動再生制限などは無視
  });
}

// 水槽タイプ別BGM切り替え（水槽表示中のBGM管理）
export async function playBgmForTankType(tankType: TankBgmType): Promise<void> {
  if (typeof window === "undefined" || !isBgmEnabled()) return;
  // シーン別BGMが有効な場合はそちらを優先（学習中は水槽BGM切り替えない）
  if (currentScene !== null) return;
  if (tankType === currentTankType && bgmAudio) return; // 同じタンクタイプで既に再生中なら何もしない
  currentTankType = tankType;
  // 現在のBGMを停止
  try {
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      bgmAudio = null;
    }
  } catch {
    // 無視
  }
  const src = BGM_BY_TANK_TYPE[tankType];
  if (!src) return; // 海水は空文字なので何もしない
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = getBgmVolume();
  bgmAudio = audio;
  void audio.play().catch(() => {
    // 自動再生制限などは無視
  });
}

// ---------- 効果音の基本部品 ----------
// 指定した周波数の音を1つ鳴らす（8ビット風に square / triangle 波を使う）
function tone(
  freq: number,
  startSec: number,
  durSec: number,
  type: OscillatorType = "square",
  volume = 0.15
): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startSec;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec);
  } catch {
    // 音の失敗でゲームを止めない
  }
}

// 周波数が変化する音（スライド）。ごぼごぼ音などに使う
function slide(
  fromFreq: number,
  toFreq: number,
  startSec: number,
  durSec: number,
  type: OscillatorType = "sine",
  volume = 0.15
): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime + startSec;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + durSec);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec);
  } catch {
    // 無視
  }
}

// ---------- 効果音（ゲームイベントごと） ----------
export const sfx = {
  // コイン獲得（チャリン）
  coin(): void {
    if (!isSfxEnabled()) return;
    tone(988, 0, 0.08);
    tone(1319, 0.08, 0.18);
  },
  // 正解（ピンポン）
  correct(): void {
    if (!isSfxEnabled()) return;
    tone(784, 0, 0.1);
    tone(1047, 0.1, 0.22);
  },
  // 不正解（ブブー）
  wrong(): void {
    if (!isSfxEnabled()) return;
    tone(196, 0, 0.12, "sawtooth", 0.1);
    tone(165, 0.12, 0.25, "sawtooth", 0.1);
  },
  // ボタンタップ（ポッ）
  tap(): void {
    if (!isSfxEnabled()) return;
    tone(660, 0, 0.06, "triangle", 0.1);
  },
  // ガチャ演出（キラキラ上昇）
  gacha(): void {
    if (!isSfxEnabled()) return;
    tone(523, 0, 0.09);
    tone(659, 0.09, 0.09);
    tone(784, 0.18, 0.09);
    tone(1047, 0.27, 0.25);
  },
  // レア魚出現（ファンファーレ）
  fanfare(): void {
    if (!isSfxEnabled()) return;
    tone(523, 0, 0.12);
    tone(659, 0.12, 0.12);
    tone(784, 0.24, 0.12);
    tone(1047, 0.36, 0.3);
    tone(784, 0.36, 0.3, "triangle", 0.1);
  },
  // レベルアップ・称号獲得
  levelUp(): void {
    if (!isSfxEnabled()) return;
    tone(659, 0, 0.1);
    tone(784, 0.1, 0.1);
    tone(988, 0.2, 0.1);
    tone(1319, 0.3, 0.35);
  },
  // しごと完了（チャリーン）
  complete(): void {
    if (!isSfxEnabled()) return;
    playFile(SFX_FILES.register, 0.5);
  },
  // 餌を食べた（ぱくっ）
  feed(): void {
    if (!isSfxEnabled()) return;
    playFile(SFX_FILES.feed, 0.7);
  },
  // 購入・出荷（レジスター）
  register(): void {
    if (!isSfxEnabled()) return;
    playFile(SFX_FILES.register, 0.5);
  },
  // 出荷（registerと同じ音）
  sell(): void {
    if (!isSfxEnabled()) return;
    playFile(SFX_FILES.register, 0.5);
  },
  // 水中に潜る（ごぼごぼ）。スタート画面タップ時
  dive(): void {
    if (!isSfxEnabled()) return;
    // 下降する泡の音を重ねてごぼごぼ感を出す
    slide(420, 90, 0, 0.5, "sine", 0.18);
    slide(620, 140, 0.12, 0.45, "sine", 0.12);
    slide(300, 70, 0.28, 0.5, "sine", 0.14);
    tone(900, 0.1, 0.05, "triangle", 0.08);
    tone(1100, 0.3, 0.05, "triangle", 0.07);
    tone(800, 0.5, 0.06, "triangle", 0.08);
  },
  // おくすり使用（回復のキラン）
  heal(): void {
    if (!isSfxEnabled()) return;
    tone(880, 0, 0.1, "triangle", 0.14);
    tone(1175, 0.1, 0.12, "triangle", 0.14);
    tone(1760, 0.22, 0.25, "triangle", 0.12);
  },
  // 魚が逃げた（悲しい下降音）
  sad(): void {
    if (!isSfxEnabled()) return;
    tone(523, 0, 0.18, "triangle", 0.12);
    tone(440, 0.18, 0.18, "triangle", 0.12);
    tone(349, 0.36, 0.35, "triangle", 0.12);
  },
};
