"use client";

// レトロ風タイトル画面（UIプロトタイプ v0.2 を移植）
// タップのみでホームへ移行（自動遷移なし）

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import PixelFish from "./PixelFish";

export default function StartScreen({ onStart }: { onStart: () => void }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 650);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      onClick={() => {
        sfx.dive(); // 水中に潜るごぼごぼ音
        onStart();
      }}
      className="w-full h-dvh flex flex-col items-center justify-center cursor-pointer select-none relative overflow-hidden mx-auto font-pixel"
      style={{
        background: "linear-gradient(180deg, #1A5E8A 0%, var(--aqua-sea) 45%, var(--aqua-deep) 100%)",
        maxWidth: "480px",
      }}
    >
      {/* 泡 */}
      {[8, 22, 40, 62, 80, 92].map((left, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-bounce opacity-25 border-2 border-foam"
          style={{
            left: `${left}%`,
            bottom: `${5 + ((i * 13) % 60)}%`,
            width: 5 + (i % 3) * 4,
            height: 5 + (i % 3) * 4,
            animationDuration: `${2 + i * 0.4}s`,
          }}
        />
      ))}

      {/* タイトルロゴ枠 */}
      <div
        className="relative px-6 py-5 mb-2 bg-black/20 pixelated"
        style={{
          border: "4px solid var(--aqua-glow)",
          boxShadow: "0 0 0 4px var(--aqua-deep), 0 0 0 8px #37c8c344",
        }}
      >
        <div className="text-center">
          <div
            className="text-3xl font-bold tracking-widest text-foam"
            style={{ textShadow: "3px 3px 0 var(--aqua-deep), 4px 4px 0 var(--aqua-glow)" }}
          >
            AquaLingua
          </div>
          <div className="text-sm mt-1 tracking-[0.4em] text-sand">アクアリンガ</div>
        </div>
        {/* 四隅のドット飾り */}
        <div className="absolute w-2.5 h-2.5 bg-sand" style={{ top: "-6px", left: "-6px" }} />
        <div className="absolute w-2.5 h-2.5 bg-sand" style={{ top: "-6px", right: "-6px" }} />
        <div className="absolute w-2.5 h-2.5 bg-sand" style={{ bottom: "-6px", left: "-6px" }} />
        <div className="absolute w-2.5 h-2.5 bg-sand" style={{ bottom: "-6px", right: "-6px" }} />
      </div>

      <div className="text-xs mb-8 tracking-widest text-dim">
        ～ 単語を育てて、魚を育てる ～
      </div>

      {/* 泳ぐピクセル魚の行進 */}
      <div className="flex items-end gap-5 mb-10">
        <div className="animate-bounce" style={{ animationDuration: "2.4s" }}>
          <PixelFish type="カクレクマノミ" size={52} />
        </div>
        <div className="animate-bounce" style={{ animationDuration: "1.9s" }}>
          <PixelFish type="ナンヨウハギ" size={64} />
        </div>
        <div className="animate-bounce" style={{ animationDuration: "2.8s" }}>
          <PixelFish type="デバスズメダイ" size={40} />
        </div>
      </div>

      {/* PRESS START */}
      <div
        className="text-base tracking-[0.3em] font-bold text-sand"
        style={{
          opacity: blink ? 1 : 0.15,
          transition: "opacity 0.2s",
          textShadow: "2px 2px 0 var(--aqua-deep)",
        }}
      >
        ▶ タップしてはじめる
      </div>

      {/* 砂底 */}
      <div
        className="absolute bottom-0 w-full h-10"
        style={{ background: "linear-gradient(180deg, transparent, #C9A85C44)" }}
      />
      <div className="absolute bottom-3 left-8 text-2xl">🪸</div>
      <div className="absolute bottom-2 right-10 text-xl">🌿</div>

      <div className="absolute bottom-2 text-[10px] tracking-widest text-dim">
        ver 1.0 MVP
      </div>
    </div>
  );
}
