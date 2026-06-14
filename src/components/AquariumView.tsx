"use client";

// 水槽ビュー（Phase 2）
// - ランダムウォーク・餌やり・状態遷移（仕様書§3）
// - UI補完: 餌の種類選択(#15)・病気表示＋おくすり(#10)・逃走演出(#11)
//   出荷確認(#12)・名前変更(#13)・成長は GameProvider 側で通知(#14)

import { useEffect, useRef, useState } from "react";
import { RARITY_INFO } from "@/data/fishMaster";
import { canShip, MAX_AFFECTION, shipValue } from "@/lib/gameLogic";
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
  const { fishList, companionList, user } = game;
  const tankRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [bait, setBait] = useState<BaitDrop | null>(null);
  const baitRef = useRef<BaitDrop | null>(null);
  const [eatingIds, setEatingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [baitKind, setBaitKind] = useState<BaitKind>("basic");
  const [shipTarget, setShipTarget] = useState<Fish | null>(null);
  const [renameTarget, setRenameTarget] = useState<Fish | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [shippedMsg, setShippedMsg] = useState<string | null>(null);

  // 初期配置（stateにまだ無い魚はこの座標から泳ぎはじめる）
  const defaultPos = (i: number): Pos => ({
    x: 15 + ((i * 25) % 65),
    y: 25 + (i % 3) * 20,
    facing: 1,
  });

  // ランダムウォーク（水平優位の2D）／eating中は餌へ向かう
  useEffect(() => {
    const timer = setInterval(() => {
      setPositions((prev) => {
        const next = { ...prev };
        fishList.forEach((f, i) => {
          const pos = next[f.fishId] ?? defaultPos(i);
          if (eatingIds.has(f.fishId) && baitRef.current) {
            const tx = baitRef.current.x;
            const ty = baitRef.current.y;
            next[f.fishId] = {
              x: tx - 4,
              y: ty - 3,
              facing: tx >= pos.x ? 1 : -1,
            };
          } else {
            const dx = (Math.random() - 0.5) * 30;
            const dy = (Math.random() - 0.5) * 12;
            let nx = pos.x + dx;
            let ny = pos.y + dy;
            let facing: 1 | -1 = dx >= 0 ? 1 : -1;
            if (nx < 4) {
              nx = 4;
              facing = 1;
            }
            if (nx > 82) {
              nx = 82;
              facing = -1;
            }
            ny = Math.max(8, Math.min(72, ny));
            next[f.fishId] = { x: nx, y: ny, facing };
          }
        });
        return next;
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [fishList, eatingIds]);

  // 餌を落とす（仕様書§3: swimming → eating）
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

    // 餌が縮んで消える → swimming へ戻す（仕様書§3）
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

  const confirmShip = () => {
    if (!shipTarget) return;
    const value = game.shipFish(shipTarget.fishId);
    if (value > 0) {
      sfx.sell();
      setShippedMsg(`${shipTarget.name} を出荷した！ +${value}G 🪙`);
      setTimeout(() => setShippedMsg(null), 2500);
      setSelected(null);
    }
    setShipTarget(null);
  };

  const submitRename = () => {
    if (renameTarget && renameValue.trim()) {
      game.renameFish(renameTarget.fishId, renameValue.trim());
    }
    setRenameTarget(null);
  };

  const sel = fishList.find((f) => f.fishId === selected) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* 水槽本体 */}
      <div
        ref={tankRef}
        onClick={dropBait}
        className="relative flex-1 overflow-hidden cursor-pointer select-none"
        style={{
          background: `linear-gradient(180deg, #134a7c 0%, var(--aqua-sea) 35%, var(--aqua-deep) 100%)`,
          minHeight: "320px",
        }}
      >
        {/* 光の筋 */}
        <div
          className="absolute top-0 left-1/4 w-16 h-2/3 opacity-10 rotate-12"
          style={{ background: "linear-gradient(180deg, var(--aqua-foam), transparent)" }}
        />
        <div
          className="absolute top-0 left-2/3 w-10 h-1/2 opacity-10 rotate-12"
          style={{ background: "linear-gradient(180deg, var(--aqua-foam), transparent)" }}
        />

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

        {/* 砂底 */}
        <div
          className="absolute bottom-0 w-full h-8"
          style={{ background: "linear-gradient(180deg, transparent, #C9A85C55)" }}
        />
        <div className="absolute bottom-2 left-6 text-2xl">🪸</div>
        <div className="absolute bottom-1 right-10 text-xl">🌿</div>
        <div className="absolute bottom-2 left-1/2 text-lg">🐚</div>

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
          const pos = positions[f.fishId] ?? defaultPos(i);
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

        {/* 操作ヒント + 餌切り替え（UI補完 #15） */}
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

        {/* 出荷完了メッセージ */}
        {shippedMsg && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-bold bg-sand text-deep shadow-lg whitespace-nowrap">
            {shippedMsg}
          </div>
        )}
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
                {sel.rarity}
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
                onClick={() => game.makeCompanion(sel.fishId)}
                className="text-xs px-3 py-1.5 rounded-lg font-bold bg-glow text-deep"
              >
                🤝 相棒に
              </button>
              <button
                onClick={() => canShip(sel) && setShipTarget(sel)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold ${
                  canShip(sel) ? "bg-sand text-deep" : "bg-white/10 text-dim"
                }`}
              >
                {canShip(sel) ? `出荷 ${shipValue(sel)}G` : `出荷ロック（好感度${MAX_AFFECTION[sel.rarity]}で解除）`}
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

      {/* 相棒リスト */}
      {companionList.length > 0 && (
        <div className="bg-mid px-3 py-2">
          <div className="text-xs font-bold text-glow mb-1.5">🤝 相棒おさかな（{companionList.length}匹）</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {companionList.map((c) => (
              <div key={c.fishId} className="flex flex-col items-center gap-1 shrink-0">
                <PixelFish type={c.type} size={36} />
                <div className="text-[10px] text-foam text-center whitespace-nowrap">{c.name}</div>
                <button
                  onClick={() => {
                    if (!game.recallCompanion(c.fishId)) {
                      game.pushNotice("💦", "水槽がいっぱい！先に出荷か相棒にしよう");
                    }
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-sand text-deep font-bold whitespace-nowrap"
                >
                  呼び戻す
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 出荷確認ダイアログ（UI補完 #12） */}
      {shipTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70"
          onClick={() => setShipTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs p-5 text-center bg-sea font-pixel"
            style={{ border: "4px solid var(--aqua-sand)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
          >
            <div className="text-3xl mb-1">🚚</div>
            <div className="font-bold text-foam mb-1">
              {shipTarget.name} を出荷する？
            </div>
            <div className="text-xs text-dim mb-3">
              {shipTarget.type}・Lv.{shipTarget.level}（もう水槽には戻らないよ）
            </div>
            <div className="text-lg font-bold text-sand mb-4">
              +{shipValue(shipTarget)}G
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShipTarget(null)}
                className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim"
              >
                やめておく
              </button>
              <button
                onClick={confirmShip}
                className="flex-1 py-2 text-sm font-bold bg-sand text-deep"
              >
                出荷する！
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 名前変更モーダル（UI補完 #13） */}
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
