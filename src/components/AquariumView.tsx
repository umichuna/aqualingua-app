"use client";

// 水槽ビュー
// - ランダムウォーク・餌やり・状態遷移（仕様書§3）
// - 底生魚（layer:"bottom"）は下層に固定表示

import { useEffect, useRef, useState } from "react";
import { getFishMaster, RARITY_INFO, RARITY_STARS } from "@/data/fishMaster";
import { BOX_CAPACITY_INITIAL, MAX_AFFECTION } from "@/lib/gameLogic";
import { sfx } from "@/lib/sound";
import type { Fish } from "@/lib/types";
import { useGame, type BaitKind } from "./GameProvider";
import PixelFish from "./PixelFish";

interface Pos {
  x: number;
  y: number;
  facing: 1 | -1;
}

interface BaitDrop {
  x: number;
  y: number;
  scale: number;
}

export default function AquariumView() {
  const game = useGame();
  const { fishList, user, allFishMaster } = game;
  const tankRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [bait, setBait] = useState<BaitDrop | null>(null);
  const baitRef = useRef<BaitDrop | null>(null);
  const [eatingIds, setEatingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [baitKind, setBaitKind] = useState<BaitKind>("basic");
  const [renameTarget, setRenameTarget] = useState<Fish | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // 底生魚は y 65〜80%、その他は 15〜60% の範囲で泳ぐ
  const defaultPos = (f: Fish, i: number): Pos => {
    const master = getFishMaster(f.type);
    const isBottom = master?.layer === "bottom";
    const yMin = isBottom ? 65 : 15;
    const yMax = isBottom ? 80 : 60;
    return {
      x: 15 + ((i * 25) % 65),
      y: yMin + ((i % 3) * (yMax - yMin)) / 2,
      facing: 1,
    };
  };

  // ランダムウォーク（底生魚は低層に固定）
  useEffect(() => {
    const timer = setInterval(() => {
      setPositions((prev) => {
        const next = { ...prev };
        fishList.forEach((f, i) => {
          const master = getFishMaster(f.type);
          const isBottom = master?.layer === "bottom";
          const yMin = isBottom ? 65 : 8;
          const yMax = isBottom ? 82 : 62;
          const pos = next[f.fishId] ?? defaultPos(f, i);
          if (eatingIds.has(f.fishId) && baitRef.current) {
            const tx = baitRef.current.x;
            const rawTy = baitRef.current.y - 3;
            const ty = isBottom ? Math.max(yMin, Math.min(yMax, rawTy)) : rawTy;
            next[f.fishId] = {
              x: tx - 4,
              y: ty,
              facing: tx >= pos.x ? 1 : -1,
            };
          } else {
            const dx = (Math.random() - 0.5) * 30;
            const dy = (Math.random() - 0.5) * (isBottom ? 6 : 12);
            let nx = pos.x + dx;
            let ny = pos.y + dy;
            let facing: 1 | -1 = dx >= 0 ? 1 : -1;
            if (nx < 4) { nx = 4; facing = 1; }
            if (nx > 82) { nx = 82; facing = -1; }
            ny = Math.max(yMin, Math.min(yMax, ny));
            next[f.fishId] = { x: nx, y: ny, facing };
          }
        });
        return next;
      });
    }, 1800);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fishList, eatingIds]);

  const dropBait = (e: React.MouseEvent<HTMLDivElement>) => {
    if (bait || fishList.length === 0) return;
    if (!game.feedAllFish(baitKind)) {
      game.pushNotice("🪱", "餌がない！ショップで買おう");
      return;
    }
    sfx.feed();
    const rect = tankRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const b: BaitDrop = {
      x: Math.min(88, Math.max(6, x)),
      y: Math.min(70, Math.max(10, y)),
      scale: 1,
    };
    setBait(b);
    baitRef.current = b;
    setEatingIds(new Set(fishList.map((f) => f.fishId)));

    let scale = 1;
    const shrink = setInterval(() => {
      scale -= 0.25;
      if (scale <= 0) {
        clearInterval(shrink);
        setBait(null);
        baitRef.current = null;
        setEatingIds(new Set());
      } else {
        setBait((cur) => (cur ? { ...cur, scale } : cur));
      }
    }, 900);
  };

  const submitRename = () => {
    if (renameTarget && renameValue.trim()) {
      game.renameFish(renameTarget.fishId, renameValue.trim());
    }
    setRenameTarget(null);
  };

  const [showSubPanel, setShowSubPanel] = useState(false);

  const sel = fishList.find((f) => f.fishId === selected) ?? null;
  const boxFish = user.boxFish ?? [];
  const boxCapacity = user.boxCapacity ?? BOX_CAPACITY_INITIAL;

  return (
    <div className="flex flex-col h-full">
      {/* 水槽本体 */}
      <div
        ref={tankRef}
        onClick={dropBait}
        className="relative flex-1 overflow-hidden cursor-pointer select-none"
        style={{
          backgroundImage: "url('/aquarium-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
          minHeight: "320px",
        }}
      >
        {/* 泡 */}
        {[12, 30, 55, 75, 90].map((left, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-bounce opacity-30 border-2 border-foam"
            style={{
              left: `${left}%`,
              bottom: `${10 + i * 8}%`,
              width: 6 + (i % 3) * 3,
              height: 6 + (i % 3) * 3,
              animationDuration: `${2 + i * 0.5}s`,
            }}
          />
        ))}

        {/* 餌 */}
        {bait && (
          <div
            className="absolute transition-transform duration-700 text-lg"
            style={{
              left: `${bait.x}%`,
              top: `${bait.y}%`,
              transform: `scale(${bait.scale})`,
            }}
          >
            {baitKind === "basic" ? "🟤" : "🍤"}
          </div>
        )}

        {/* 魚たち */}
        {fishList.map((f, i) => {
          const pos = positions[f.fishId] ?? defaultPos(f, i);
          const eating = eatingIds.has(f.fishId);
          return (
            <div
              key={f.fishId}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(f.fishId === selected ? null : f.fishId);
              }}
              className="absolute"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transition: eating ? "all 0.9s ease-in" : "all 1.8s ease-in-out",
              }}
            >
              <PixelFish
                type={f.type}
                facing={pos.facing}
                sick={f.isSick}
                size={f.growthStage === "幼魚" ? 32 : 48}
                imageUrl={allFishMaster.find((m) => m.type === f.type)?.imageUrl}
              />
              {f.isSick && (
                <div className="absolute -top-3 -right-1 text-sm">🤒</div>
              )}
              {selected === f.fishId && (
                <div className="text-xs px-1 rounded whitespace-nowrap text-center mt-0.5 bg-black/55 text-foam">
                  {f.name}
                </div>
              )}
            </div>
          );
        })}

        {/* 空の水槽メッセージ */}
        {fishList.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-dim text-sm">
            <span className="text-3xl">🫧</span>
            <span>まだ魚がいない…ショップのガチャでお迎えしよう</span>
          </div>
        )}

        {/* 操作ヒント + 餌切り替え */}
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-black/40 text-dim"
          onClick={(e) => e.stopPropagation()}
        >
          <span>タップで餌やり</span>
          <button
            onClick={() => setBaitKind("basic")}
            className={`px-2 py-0.5 rounded-full font-bold ${baitKind === "basic" ? "bg-sand text-deep" : "text-dim"}`}
          >
            🪱 {user.items.baitBasic}
          </button>
          <button
            onClick={() => setBaitKind("premium")}
            className={`px-2 py-0.5 rounded-full font-bold ${baitKind === "premium" ? "bg-sand text-deep" : "text-dim"}`}
          >
            🍤 {user.items.baitPremium}
          </button>
        </div>

        {/* 飼育数 */}
        <div className="absolute top-2 right-2 text-xs px-2 py-1 rounded-full bg-black/40 text-dim">
          🐠 {fishList.length} / {user.tankCapacity}
        </div>

        {/* ボックス表示トグルボタン */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowSubPanel((v) => !v); }}
          className="absolute bottom-2 left-2 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-black/60 text-foam font-bold"
        >
          {showSubPanel ? "✕" : <span>📦 {boxFish.length}/{boxCapacity}</span>}
        </button>
      </div>

      {/* 魚詳細パネル */}
      {sel && (
        <div className="p-3 bg-mid">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span
                className="text-xs px-2 py-0.5 rounded-full mr-2 font-bold"
                style={{ background: RARITY_INFO[sel.rarity].color, color: "var(--aqua-deep)" }}
              >
                {RARITY_STARS[sel.rarity]}
              </span>
              <button
                className="font-bold text-foam underline decoration-dotted"
                onClick={() => {
                  setRenameTarget(sel);
                  setRenameValue(sel.name);
                }}
                title="タップで名前変更"
              >
                {sel.name} ✏️
              </button>
              <span className="text-xs ml-2 text-dim">
                {sel.type}・{sel.growthStage} Lv.{sel.level}
              </span>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {sel.isSick && (
                <button
                  onClick={() => {
                    if (!game.useMedicine(sel.fishId)) {
                      game.pushNotice("💊", "おくすりがない！ショップで買おう");
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold bg-coral text-deep"
                >
                  💊 おくすり ({user.items.medicine})
                </button>
              )}
              <button
                onClick={() => game.moveTankFishToBox(sel.fishId)}
                disabled={(user.boxFish?.length ?? 0) >= (user.boxCapacity ?? 5)}
                className="text-xs px-3 py-1.5 rounded-lg font-bold bg-glow text-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📦 ボックスへ
              </button>
            </div>
          </div>
          {/* 好感度バー */}
          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1 text-dim">
              <span>好感度{sel.isSick && <span className="text-coral ml-2">🤒 病気（3日以内に治療しないと逃げてしまう）</span>}</span>
              <span>
                {sel.affection} / {MAX_AFFECTION[sel.rarity]}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-black/40">
              <div
                className={`h-full rounded-full transition-all duration-500 ${sel.affection >= MAX_AFFECTION[sel.rarity] ? "bg-sand" : "bg-glow"}`}
                style={{ width: `${Math.min(100, (sel.affection / MAX_AFFECTION[sel.rarity]) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ボックスパネル（トグルで表示） */}
      {showSubPanel && (
        <div className="bg-mid border-t border-white/10">
          {/* 一時保存ボックス */}
          <div className="px-3 py-2 border-t border-white/10">
            <div className="text-xs font-bold text-glow mb-1.5">
              📦 ボックス（{boxFish.length}/{boxCapacity}）
            </div>
            {boxFish.length === 0 ? (
              <div className="text-xs text-dim">水槽が満杯の時に一時保管できるよ</div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {boxFish.map((f) => (
                  <div key={f.fishId} className="flex flex-col items-center gap-1 shrink-0">
                    <PixelFish type={f.type} size={36} imageUrl={allFishMaster.find((m) => m.type === f.type)?.imageUrl} />
                    <div className="text-[10px] text-foam text-center whitespace-nowrap">{f.name}</div>
                    <button
                      onClick={() => {
                        if (!game.moveBoxFishToTank(f.fishId)) {
                          game.pushNotice("💦", "水槽がいっぱい！まず水槽に空きを作ろう");
                        }
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-glow text-deep font-bold whitespace-nowrap"
                    >
                      水槽へ
                    </button>
                    <button
                      onClick={() => game.releaseBoxFish(f.fishId)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-dim font-bold whitespace-nowrap"
                    >
                      🌊 逃がす
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 名前変更モーダル */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70"
          onClick={() => setRenameTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs p-5 bg-sea font-pixel"
            style={{ border: "4px solid var(--aqua-glow)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
          >
            <div className="font-bold text-foam mb-3 text-center">✏️ 名前を変える</div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={10}
              className="w-full px-3 py-2 rounded-lg bg-black/40 text-foam outline-none mb-3"
              placeholder="あたらしい名前（10文字まで）"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim"
              >
                キャンセル
              </button>
              <button
                onClick={submitRename}
                className="flex-1 py-2 text-sm font-bold bg-glow text-deep"
              >
                きめた！
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
