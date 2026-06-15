"use client";

// ショップビュー
// - 3種ガチャ（激安200G/スタンダード500G/プレミアム1500G）- 要求 #7
// - 餌・おくすり・水槽拡張

import { useState } from "react";
import { RARITY_INFO, type FishMaster } from "@/data/fishMaster";
import {
  BOX_CAPACITY_INITIAL,
  boxExpansionPrice,
  GACHA_TIERS,
  MAX_TANK_CAPACITY,
  SHOP_PRICES,
  tankExpansionPrice,
  type GachaTier,
} from "@/lib/gameLogic";
import { sfx } from "@/lib/sound";
import { useGame } from "./GameProvider";
import PixelFish from "./PixelFish";

type GachaPhase = "rolling" | "reveal" | "naming";

const SHOP_ITEMS = [
  { key: "baitBasic10" as const, name: "ベーシック餌 ×10", desc: "好感度 +5 / 個", price: SHOP_PRICES.baitBasic10, icon: "🪱" },
  { key: "baitPremium5" as const, name: "高級フレーク ×5", desc: "好感度 +15 / 個", price: SHOP_PRICES.baitPremium5, icon: "🍤" },
  { key: "medicine" as const, name: "おくすり", desc: "病気を治療する", price: SHOP_PRICES.medicine, icon: "💊" },
  { key: "tankExpansion" as const, name: "水槽拡張キット", desc: "飼育上限 +2", price: SHOP_PRICES.tankExpansion, icon: "🪸" },
  { key: "boxExpansion" as const, name: "ボックス拡張キット", desc: "ボックス +5匹", price: SHOP_PRICES.boxExpansion, icon: "📦" },
];

// ガチャのレア度確率を表示用テキストに変換
function rarityRateText(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .map(([k, w]) => `${k} ${Math.round((w / total) * 100)}%`)
    .join(" / ");
}

export default function ShopView() {
  const game = useGame();
  const { user, fishList } = game;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gacha, setGacha] = useState<{
    phase: GachaPhase;
    fish: FishMaster;
    tier: GachaTier;
  } | null>(null);
  const [nameInput, setNameInput] = useState("");

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 1800);
  };

  const rollGachaFlow = (tier: GachaTier) => {
    const info = GACHA_TIERS[tier];
    if (user.gold < info.price) {
      flash(false, "ゴールドが足りません");
      return;
    }
    const fish = game.buyGachaFish(tier);
    if (!fish) return;
    sfx.gacha();
    setGacha({ phase: "rolling", fish, tier });
    setTimeout(() => {
      // 高級・ロマンはファンファーレで盛り上げる
      if (fish.rarity === "高級" || fish.rarity === "ロマン") sfx.fanfare();
      else sfx.correct();
      setGacha((g) => (g ? { ...g, phase: "reveal" } : g));
    }, 1800);
  };

  const confirmName = () => {
    if (!gacha) return;
    const name = nameInput.trim() || gacha.fish.type;
    const boxCap = user.boxCapacity ?? BOX_CAPACITY_INITIAL;
    if (fishList.length >= user.tankCapacity) {
      if ((user.boxFish ?? []).length >= boxCap) {
        flash(false, "水槽もボックスも満杯！ボックス拡張キットを買おう");
        return;
      }
      game.addFishToBox(gacha.fish, name);
    } else {
      game.addFishToTank(gacha.fish, name);
      game.pushNotice("🐠", `${name} が水槽になかまいりした！`);
    }
    setGacha(null);
    setNameInput("");
  };

  const buy = (item: (typeof SHOP_ITEMS)[number]) => {
    if (item.key === "tankExpansion" && user.tankCapacity >= MAX_TANK_CAPACITY) {
      flash(false, "水槽はこれ以上拡張できないよ");
      return;
    }
    if (game.buyItem(item.key)) {
      sfx.register();
      flash(true, `${item.name} を購入しました！`);
    } else {
      flash(false, "ゴールドが足りません");
    }
  };

  const getItemPrice = (item: (typeof SHOP_ITEMS)[number]): number => {
    if (item.key === "tankExpansion") return tankExpansionPrice(user.tankCapacity);
    if (item.key === "boxExpansion") return boxExpansionPrice(user.boxCapacity ?? BOX_CAPACITY_INITIAL);
    return item.price;
  };

  const getItemOwned = (item: (typeof SHOP_ITEMS)[number]): string => {
    if (item.key === "baitBasic10") return `所持 ${user.items.baitBasic}`;
    if (item.key === "baitPremium5") return `所持 ${user.items.baitPremium}`;
    if (item.key === "medicine") return `所持 ${user.items.medicine}`;
    if (item.key === "tankExpansion") return `上限 ${user.tankCapacity}/${MAX_TANK_CAPACITY}`;
    return `上限 ${user.boxCapacity ?? BOX_CAPACITY_INITIAL}匹`;
  };

  const TIER_KEYS: GachaTier[] = ["cheap", "normal", "premium"];

  return (
    <div className="p-4 flex flex-col gap-3">
      <h2 className="font-bold text-lg text-foam">ショップ</h2>

      {/* 3種ガチャ（要求 #7） */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-glow">🎰 おさかなガチャ（水槽 {fishList.length}/{user.tankCapacity}）</div>
        {TIER_KEYS.map((tier) => {
          const info = GACHA_TIERS[tier];
          const afford = user.gold >= info.price;
          return (
            <div
              key={tier}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{
                background:
                  tier === "premium"
                    ? "linear-gradient(135deg, #1E3A5F, #2D1B6B)"
                    : tier === "normal"
                      ? "linear-gradient(135deg, var(--aqua-mid), #1E5288)"
                      : "linear-gradient(135deg, #1A3040, #0E2A4F)",
              }}
            >
              <span className="text-2xl">{info.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-foam">{info.label}</div>
                <div className="text-[10px] text-dim">{info.desc}</div>
                <div className="text-[10px] text-dim mt-0.5">{rarityRateText(info.weights)}</div>
              </div>
              <button
                onClick={() => rollGachaFlow(tier)}
                className={`text-xs px-3 py-2 rounded-xl font-bold shrink-0 active:scale-95 transition-transform ${
                  afford ? "bg-sand text-deep" : "bg-white/10 text-dim"
                }`}
              >
                {info.price}G
              </button>
            </div>
          );
        })}
      </div>

      {/* アイテム */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-glow">🛒 アイテム</div>
        {SHOP_ITEMS.map((item) => {
          const price = getItemPrice(item);
          const afford = user.gold >= price;
          const owned = getItemOwned(item);
          return (
            <div key={item.key} className="flex items-center gap-3 rounded-xl p-3 bg-mid">
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1">
                <div className="font-bold text-sm text-foam">{item.name}</div>
                <div className="text-xs text-dim">{item.desc}・{owned}</div>
              </div>
              <button
                onClick={() => buy(item)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold active:scale-95 transition-transform ${
                  afford ? "bg-glow text-deep" : "bg-white/10 text-dim"
                }`}
              >
                {price}G
              </button>
            </div>
          );
        })}
      </div>

      {msg && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-bold shadow-lg whitespace-nowrap ${
            msg.ok ? "bg-glow text-deep" : "bg-coral text-deep"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ガチャ演出モーダル */}
      {gacha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80">
          <div
            className="w-full max-w-xs p-6 text-center bg-sea font-pixel relative overflow-hidden"
            style={{
              border: `4px solid ${
                gacha.phase === "rolling"
                  ? "var(--aqua-glow)"
                  : RARITY_INFO[gacha.fish.rarity].color
              }`,
              boxShadow: "0 0 0 4px var(--aqua-deep)",
            }}
          >
            {gacha.phase === "rolling" && (
              <div className="py-8">
                <div className="text-5xl animate-bounce">🫧</div>
                <div className="text-sm text-dim mt-4 tracking-widest">
                  {GACHA_TIERS[gacha.tier].label}…なにかが近づいてくる
                </div>
              </div>
            )}

            {gacha.phase === "reveal" && (
              <div className="py-4">
                <div
                  className="inline-block text-xs px-3 py-1 rounded-full font-bold mb-3"
                  style={{
                    background: RARITY_INFO[gacha.fish.rarity].color,
                    color: "var(--aqua-deep)",
                  }}
                >
                  {gacha.fish.rarity}
                </div>
                <div className="flex justify-center animate-bounce" style={{ animationDuration: "2s" }}>
                  <PixelFish type={gacha.fish.type} size={80} />
                </div>
                <div className="font-bold text-lg text-foam mt-2">{gacha.fish.type}</div>
                <div className="text-xs text-dim mt-1">{gacha.fish.description}</div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      if (!gacha) return;
                      game.pushNotice("🌊", `${gacha.fish.type} を海へ帰した`);
                      setGacha(null);
                    }}
                    className="flex-1 py-2.5 font-bold bg-white/10 text-dim active:scale-95 transition-transform"
                  >
                    にがす
                  </button>
                  <button
                    onClick={() => setGacha((g) => (g ? { ...g, phase: "naming" } : g))}
                    className="flex-1 py-2.5 font-bold bg-sand text-deep active:scale-95 transition-transform"
                  >
                    {fishList.length >= user.tankCapacity ? "📦 ボックスへ" : "なかまにする！"}
                  </button>
                </div>
              </div>
            )}

            {gacha.phase === "naming" && (
              <div className="py-2">
                <div className="flex justify-center mb-2">
                  <PixelFish type={gacha.fish.type} size={56} />
                </div>
                <div className="font-bold text-foam mb-3">名前をつけてあげよう</div>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={10}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-foam outline-none mb-3 text-center"
                  placeholder={gacha.fish.type}
                  autoFocus
                />
                <button
                  onClick={confirmName}
                  className="w-full py-2.5 font-bold bg-glow text-deep active:scale-95 transition-transform"
                >
                  きめた！
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
