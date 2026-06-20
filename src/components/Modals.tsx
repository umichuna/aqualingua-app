"use client";

// デイリーリワード・設定・オンボーディングのモーダル群
// UI補完: デイリー日付判定(#18)・設定のMVP対応(#19)・オンボーディング(#16)

import { useRef, useState } from "react";
import { exportAllData, importAllData, type BackupData } from "@/lib/db";
import { todayString } from "@/lib/gameLogic";
import {
  getBgmVolume,
  isBgmEnabled,
  isSfxEnabled,
  setBgmEnabled,
  setBgmVolume,
  setSfxEnabled,
  sfx,
} from "@/lib/sound";
import { useGame } from "./GameProvider";
import PixelFish from "./PixelFish";

// ON/OFFトグルスイッチ（設定画面用）
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-glow" : "bg-white/20"}`}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-foam transition-all"
        style={{ left: on ? "22px" : "2px" }}
      />
    </button>
  );
}

// ---------- 設定（UI補完 #19: MVP対応版） ----------
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const [sfxOn, setSfxOn] = useState(isSfxEnabled);
  const [bgmOn, setBgmOn] = useState(isBgmEnabled);
  const [bgmVol, setBgmVol] = useState(getBgmVolume);
  const [ioMsg, setIoMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // セーブ: ローカル→クラウド（push）＋ JSONファイルをダウンロード
  const saveToFile = async () => {
    setSaving(true);
    try {
      await game.pushNow();
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aqualingua-save-${todayString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setIoMsg("💾 セーブファイルをダウンロードしました");
    } finally {
      setSaving(false);
    }
  };

  // ロード: JSONファイルを読み込んで全データを置き換え → リロードで反映
  const loadFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;
      if (!data || !Array.isArray(data.words) || !Array.isArray(data.userStatus)) {
        setIoMsg("⚠️ セーブファイルの形式が正しくありません");
        return;
      }
      await importAllData(data);
      window.location.reload();
    } catch {
      setIoMsg("⚠️ 読み込みに失敗しました（ファイルが壊れている可能性）");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 bg-sea max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg text-foam">⚙️ 設定</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-lg bg-white/10 text-dim">
            閉じる
          </button>
        </div>

        <div className="text-[10px] font-bold tracking-widest mb-1 text-glow">しごと記録</div>
        <div className="rounded-xl px-3 py-2.5 mb-3 bg-mid text-sm flex items-center justify-between">
          <span className="text-dim">しごと完了の累計</span>
          <span className="font-bold text-foam">
            {game.user.totalStudyCount}回（職業Lv.{game.user.jobLevel}）
          </span>
        </div>
        {game.user.achievedTitles.length > 0 && (
          <div className="rounded-xl px-3 py-2.5 mb-3 bg-mid text-sm">
            <div className="text-dim text-xs mb-1">獲得した称号</div>
            <div className="flex flex-wrap gap-1.5">
              {game.user.achievedTitles.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full font-bold bg-sand text-deep">
                  👑 {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] font-bold tracking-widest mb-1 text-glow">サウンド</div>
        <div className="rounded-xl px-3 py-2.5 mb-2 bg-mid flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-foam">効果音</div>
            <div className="text-[10px] text-dim">正解音・コイン音など</div>
          </div>
          <Toggle
            on={sfxOn}
            onToggle={() => {
              const next = !sfxOn;
              setSfxEnabled(next);
              setSfxOn(next);
              if (next) sfx.tap();
            }}
          />
        </div>
        <div className="rounded-xl px-3 py-2.5 mb-3 bg-mid">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-foam">BGM</div>
              <div className="text-[10px] text-dim">
                public/bgm.mp3 を置くと再生されます
              </div>
            </div>
            <Toggle
              on={bgmOn}
              onToggle={() => {
                const next = !bgmOn;
                setBgmEnabled(next);
                setBgmOn(next);
              }}
            />
          </div>
          {bgmOn && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-dim">音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bgmVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBgmVolume(v);
                  setBgmVol(v);
                }}
                className="flex-1"
              />
            </div>
          )}
        </div>

        <div className="text-[10px] font-bold tracking-widest mb-1 text-glow">セーブ &amp; ロード</div>
        <div className="rounded-xl px-3 py-2.5 mb-2 bg-mid flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-foam">データをセーブ</div>
            <div className="text-[10px] text-dim">クラウド保存＋JSONダウンロード</div>
          </div>
          <button
            disabled={saving}
            onClick={() => void saveToFile()}
            className="text-xs px-2.5 py-1 rounded-lg font-bold bg-glow text-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中…" : "💾 セーブ"}
          </button>
        </div>
        <div className="rounded-xl px-3 py-2.5 mb-2 bg-mid flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-foam">データをロード</div>
            <div className="text-[10px] text-dim">セーブファイルを読み込み（今のデータは上書き）</div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs px-2.5 py-1 rounded-lg font-bold bg-sand text-deep"
          >
            📂 ロード
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFromFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {ioMsg && <p className="text-xs text-glow mb-2">{ioMsg}</p>}

        <div className="text-[10px] font-bold tracking-widest mb-1 text-glow">データ &amp; 同期</div>
        <div className="rounded-xl px-3 py-2.5 mb-3 bg-mid">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-foam">クラウド同期</div>
              <div className="text-[10px] text-dim">クラウド→ローカルに受信する</div>
            </div>
            <button
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                void game.syncNow().finally(() => setSyncing(false));
              }}
              className="text-xs px-2.5 py-1 rounded-lg font-bold bg-glow text-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? "同期中…" : "☁️ 同期"}
            </button>
          </div>
        </div>

        <div className="text-[10px] font-bold tracking-widest mb-1 text-coral">危険ゾーン</div>
        <div className="rounded-xl px-3 py-2.5 flex items-center justify-between bg-mid">
          <div>
            <div className="text-sm font-bold text-foam">ローカルデータを初期化</div>
            <div className="text-[10px] text-dim">単語・魚・ゴールドが全部消えます（復元不可）</div>
          </div>
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs px-2.5 py-1 rounded-lg font-bold bg-coral/20 text-coral"
          >
            初期化
          </button>
        </div>

<div className="text-center text-[10px] mt-3 text-dim">AquaLingua v1.0 MVP</div>

        {confirmReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80" onClick={() => setConfirmReset(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs p-5 text-center bg-sea font-pixel"
              style={{ border: "4px solid var(--aqua-coral)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
            >
              <div className="text-3xl mb-2">⚠️</div>
              <div className="font-bold text-foam mb-1">本当に全部消す？</div>
              <div className="text-xs text-dim mb-4">魚も単語もゴールドも、ぜんぶ最初からになるよ</div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmReset(false)} className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim">
                  やめておく
                </button>
                <button
                  onClick={() => {
                    void game.resetAllData().then(() => {
                      setConfirmReset(false);
                      onClose();
                    });
                  }}
                  className="flex-1 py-2 text-sm font-bold bg-coral text-deep"
                >
                  初期化する
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- オンボーディング（UI補完 #16） ----------
const ONBOARD_SLIDES = [
  {
    icon: "💼",
    title: "しごとでゴールドを稼ごう",
    body: "「しごと」タブで自己採点・4択クイズ・聞き流しができるよ。しごとをするとゴールドがもらえる！",
  },
  {
    icon: "🐠",
    title: "魚を育てよう",
    body: "ゴールドでガチャを回して魚をお迎え。水槽をタップして餌をあげると好感度が上がるよ。",
  },
  {
    icon: "🚚",
    title: "サボると大変…",
    body: "1日サボると魚の好感度が3ずつ下がるよ。好感度が0になると病気に！病気のまま3日たつと海へ帰ってしまう…。水槽が満杯のときはボックスに一時保存できるよ！",
  },
];

// viewOnly: ホームの「あそびかた」から開いたとき true（アイテム付与なし・とじるだけ）
export function Onboarding({
  onDone,
  viewOnly = false,
}: {
  onDone: () => void;
  viewOnly?: boolean;
}) {
  const [slide, setSlide] = useState(0);
  const s = ONBOARD_SLIDES[slide];
  const last = slide === ONBOARD_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-deep">
      <div
        className="w-full max-w-xs p-6 text-center bg-sea font-pixel"
        style={{ border: "4px solid var(--aqua-glow)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
      >
        <div className="text-5xl mb-3">{s.icon}</div>
        <div className="font-bold text-lg text-foam mb-2">{s.title}</div>
        <div className="text-sm text-dim leading-relaxed mb-5">{s.body}</div>
        <div className="flex justify-center gap-1.5 mb-4">
          {ONBOARD_SLIDES.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full ${i === slide ? "bg-glow" : "bg-white/20"}`}
            />
          ))}
        </div>
        {last && (
          <div className="flex justify-center mb-3">
            <PixelFish type="ツノダシ" size={48} />
          </div>
        )}
        <button
          onClick={() => (last ? onDone() : setSlide((i) => i + 1))}
          className="w-full py-2.5 font-bold bg-glow text-deep active:scale-95 transition-transform"
        >
          {last ? (viewOnly ? "とじる" : "はじめる！（魚と餌をもらう）") : "つぎへ →"}
        </button>
        {viewOnly && !last && (
          <button onClick={onDone} className="mt-2 text-xs underline text-dim">
            とじる
          </button>
        )}
      </div>
    </div>
  );
}
