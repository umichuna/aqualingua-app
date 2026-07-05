// 実績マスターデータと報酬設定
// ★ 実績の追加方法 ★
// 下の配列に実績を1行追加するだけ。報酬のおさかなは図鑑のカスタム魚追加画面で
// 「実績専用にする」 → このidを選んで紐付ける（実装後にユーザーが行う）。

import type { Tank } from "@/lib/types";

export interface AchievementStats {
  tanks: Tank[];
  lifetimeWordsAnswered: number;
  lifetimeGoldEarned: number;
  jobLevel: number;
  customFishCount: number;
  encyclopediaCount: number; // 発見済み魚数（実績専用魚は分母・分子とも除外）
  gachaFishMasterCount: number; // ガチャ対象魚の総数（rewardOnly除く）
}

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  isUnlocked: (s: AchievementStats) => boolean;
  progressText?: (s: AchievementStats) => string; // 未達成時に「2/3」等を表示
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_freshwater_tank",
    label: "はじめての淡水デビュー",
    icon: "🌿",
    description: "淡水水槽を初めて購入する",
    isUnlocked: (s) => s.tanks.some((t) => t.type === "freshwater"),
  },
  {
    id: "three_tanks",
    label: "水族館オーナー",
    icon: "🏛️",
    description: "水槽の数が合計3つになる",
    isUnlocked: (s) => s.tanks.length >= 3,
    progressText: (s) => `${Math.min(s.tanks.length, 3)}/3`,
  },
  {
    id: "six_tanks_full",
    label: "水族館コンプリート",
    icon: "🏆",
    description: "海水・淡水すべての水槽（合計6つ）を購入する",
    isUnlocked: (s) =>
      s.tanks.filter((t) => t.type === "saltwater").length >= 3 &&
      s.tanks.filter((t) => t.type === "freshwater").length >= 3,
  },
  {
    id: "words_10000",
    label: "単語マスター",
    icon: "📚",
    description: "累計学習単語数が1万問に到達する",
    isUnlocked: (s) => s.lifetimeWordsAnswered >= 10000,
    progressText: (s) =>
      `${Math.min(s.lifetimeWordsAnswered, 10000).toLocaleString()}/10,000`,
  },
  {
    id: "words_50000",
    label: "英単語の求道者",
    icon: "🎓",
    description: "累計学習単語数が5万問に到達する",
    isUnlocked: (s) => s.lifetimeWordsAnswered >= 50000,
  },
  {
    id: "gold_30000",
    label: "ゴールドハンター",
    icon: "🪙",
    description: "累計獲得ゴールドが3万Gに到達する",
    isUnlocked: (s) => s.lifetimeGoldEarned >= 30000,
    progressText: (s) =>
      `${Math.min(s.lifetimeGoldEarned, 30000).toLocaleString()}/30,000G`,
  },
  {
    id: "gold_100000",
    label: "ゴールドの匠",
    icon: "💰",
    description: "累計獲得ゴールドが10万Gに到達する",
    isUnlocked: (s) => s.lifetimeGoldEarned >= 100000,
    progressText: (s) =>
      `${Math.min(s.lifetimeGoldEarned, 100000).toLocaleString()}/100,000G`,
  },
  {
    id: "job_level_max",
    label: "アクアマスター認定",
    icon: "👑",
    description: "職業レベルが10（最大）に到達する",
    isUnlocked: (s) => s.jobLevel >= 10,
  },
  {
    id: "custom_fish_creator",
    label: "オリジナル飼育員",
    icon: "🎨",
    description: "カスタムおさかなを初めて登録する",
    isUnlocked: (s) => s.customFishCount >= 1,
  },
  {
    id: "encyclopedia_complete",
    label: "魚コレクター",
    icon: "📕",
    description: "30種類以上のおさかなを図鑑に登録する",
    isUnlocked: (s) => s.encyclopediaCount >= 30,
    progressText: (s) => `${Math.min(s.encyclopediaCount, 30)}/30`,
  },
];

export function checkNewAchievements(
  stats: AchievementStats,
  unlocked: string[]
): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.isUnlocked(stats));
}

export function buildAchievementStats(
  tanks: Tank[],
  lifetimeWordsAnswered: number,
  lifetimeGoldEarned: number,
  jobLevel: number,
  customFishCount: number,
  encyclopediaCount: number,
  gachaFishMasterCount: number
): AchievementStats {
  return {
    tanks,
    lifetimeWordsAnswered,
    lifetimeGoldEarned,
    jobLevel,
    customFishCount,
    encyclopediaCount,
    gachaFishMasterCount,
  };
}
