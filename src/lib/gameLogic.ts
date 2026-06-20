// ゲームルール・経済バランス（仕様書 aqualingua_spec.md §3〜§5 準拠）

import { TITLE_MILESTONES } from "@/data/titles";
import type { Fish, Rarity, StudyMode } from "./types";

// ---------- しごと報酬（1問あたりの金額） ----------
export const MODE_BASE_GOLD: Record<StudyMode, number> = {
  self: 10, // 自己採点 10G/問
  choice: 5, // 選択肢クイズ 5G/問
  listen: 2, // 聞き流し 2G/問
};

// セッション報酬 = 問題数 × 1問あたり金額
export function sessionGold(
  mode: StudyMode,
  count: number,
  _jobLevel?: number,
): number {
  return count * MODE_BASE_GOLD[mode];
}

export function dailyGoldReward(mode: StudyMode, jobLevel?: number): number {
  return sessionGold(mode, 1, jobLevel);
}

// ---------- 好感度バランス（レア度別上限・上昇倍率） ----------
export const MAX_AFFECTION: Record<Rarity, number> = {
  激安: 100,
  普通: 110,
  高級: 125,
  ロマン: 150,
};

// レア度が高いほど好感度が上がりにくい（倍率）
export const AFFECTION_GAIN_RATE: Record<Rarity, number> = {
  激安: 1.0,
  普通: 0.8,
  高級: 0.6,
  ロマン: 0.4,
};

// ---------- 魚の成長 ----------
export const MAX_FISH_LEVEL = 30;
export const ADULT_LEVEL = 5; // このレベルで幼魚→成魚

// 餌やり1回ごとの効果。レベルも+1（上限30）
export const BAIT_EFFECT = {
  basic: 5, // ベーシック餌: 好感度+5
  premium: 15, // 高級フレーク: 好感度+15
} as const;

// ---------- ジョブレベル ----------
// 学習完了10回ごとにジョブレベル+1（最大10）
export function jobLevelFor(totalStudyCount: number): number {
  return Math.min(10, 1 + Math.floor(totalStudyCount / 10));
}

// 称号（しごと累計のマイルストーン。追加方法は data/titles.ts を参照）
export function titlesFor(totalStudyCount: number): string[] {
  return TITLE_MILESTONES.filter(([n]) => totalStudyCount >= n).map(
    ([, t]) => t
  );
}

// ---------- 放置ペナルティ ----------
// ルール: 1日サボると好感度 -3。好感度が0になると必ず病気になる。
// 病気のまま3日たつと野生復帰（逃走）。
// フォアグラウンド復帰時に実行する。返り値で更新後の魚リストを返す。
// status が 'running_away' になった魚は呼び出し側で逃走演出→DELETEする。
export const AFFECTION_DROP_PER_DAY = 3;

export function calculateOfflineEffects(
  fishList: Fish[],
  lastActiveTime: number,
  now: number,
  buffs: { decay_reduction?: number; disease_resistance?: number } = {}
): Fish[] {
  const elapsedSeconds = (now - lastActiveTime) / 1000;
  const elapsedDays = Math.floor(elapsedSeconds / 86400);

  if (elapsedDays < 1) return fishList;

  const decayMult = 1 - (buffs.decay_reduction ?? 0);
  const diseaseResist = buffs.disease_resistance ?? 0;
  const totalAffectionDrop = Math.floor(elapsedDays * AFFECTION_DROP_PER_DAY * decayMult);
  return fishList.map((orig) => {
    const fish: Fish = { ...orig };
    fish.affection = Math.max(0, fish.affection - totalAffectionDrop);
    // 好感度が0になったら病気になる（病気耐性バフがあれば確率で防ぐ）
    if (fish.affection <= 0 && !fish.isSick) {
      if (Math.random() > diseaseResist) {
        fish.isSick = true;
        fish.sickStartTime = fish.sickStartTime || now;
      }
    }

    // 野生復帰チェック（72時間 = 3日 上限）
    if (fish.isSick && fish.sickStartTime) {
      const sickDurationDays = (now - fish.sickStartTime) / 86400000;
      if (sickDurationDays >= 3) {
        fish.status = "running_away";
      }
    }
    return fish;
  });
}

// ローカル日付 "YYYY-MM-DD"
export function todayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- ガチャの種類（要求 #7） ----------
// 3種類のガチャ。価格が高いほどレアが出やすい重みテーブルを持つ。
export type GachaTier = "cheap" | "normal" | "premium";

export interface GachaInfo {
  label: string;
  price: number;
  icon: string;
  weights: Record<"激安" | "普通" | "高級" | "ロマン", number>;
  desc: string;
}

export const GACHA_TIERS: Record<GachaTier, GachaInfo> = {
  cheap: {
    label: "はじめてガチャ",
    price: 200,
    icon: "🪣",
    weights: { 激安: 70, 普通: 25, 高級: 5, ロマン: 0 },
    desc: "手頃な値段で気軽に回せる。激安・普通が中心。",
  },
  normal: {
    label: "スタンダードガチャ",
    price: 500,
    icon: "🎰",
    weights: { 激安: 35, 普通: 50, 高級: 10, ロマン: 5 },
    desc: "バランスのいい定番ガチャ。高級も狙える。",
  },
  premium: {
    label: "プレミアムガチャ",
    price: 1500,
    icon: "💎",
    weights: { 激安: 0, 普通: 10, 高級: 50, ロマン: 40 },
    desc: "高価だが高級・ロマンが大幅アップ！",
  },
};

// ---------- ショップ価格 ----------
export const SHOP_PRICES = {
  baitBasic10: 50, // ベーシック餌×10
  baitPremium5: 180, // 高級フレーク×5
  medicine: 300, // おくすり
  tankExpansion: 1200, // 水槽拡張キット（初回価格。実価格は tankExpansionPrice() で計算）
  boxExpansion: 800, // ボックス拡張キット（初回価格。実価格は boxExpansionPrice() で計算）
} as const;

export const MAX_TANK_CAPACITY = 15;

// 水槽拡張キットは常に1200G固定
export function tankExpansionPrice(_tankCapacity?: number): number {
  return SHOP_PRICES.tankExpansion;
}

// ---------- ボックス ----------
export const BOX_CAPACITY_INITIAL = 5;

// ボックス拡張キットも2倍ずつ値上がり（初期5匹→800G）
export function boxExpansionPrice(boxCapacity: number): number {
  const purchases = Math.max(0, Math.floor((boxCapacity - BOX_CAPACITY_INITIAL) / 5));
  return 800 * 2 ** purchases;
}
