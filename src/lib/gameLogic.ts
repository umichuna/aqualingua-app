// ゲームルール・経済バランス（仕様書 aqualingua_spec.md §3〜§5 準拠）

import { TITLE_MILESTONES } from "@/data/titles";
import type { Fish, Rarity, StudyMode, WaterType } from "./types";

// 魚が属する水槽ID を解決する。
// tankId 未設定の旧データは「その魚の水種の最初の水槽」にフォールバックする。
// 表示（水槽ビュー）と餌やり・容量計算でフォールバックがずれると、
// 「見えている魚に餌が届かない」「別水槽の匹数で満杯判定される」等の不整合が起きるため、
// 水槽の所属判定は必ずこの関数を通す。
export function resolveTankId(
  fish: { type: string; tankId?: string },
  tanks: { id: string; type: WaterType }[],
  fishMasters: { type: string; waterType?: WaterType }[]
): string {
  if (fish.tankId) return fish.tankId;
  const waterType = fishMasters.find((m) => m.type === fish.type)?.waterType ?? "saltwater";
  return tanks.find((t) => t.type === waterType)?.id ?? "sw-1";
}

// ---------- しごと報酬（1問あたりの金額） ----------
export const MODE_BASE_GOLD: Record<StudyMode, number> = {
  self: 10, // 自己採点 10G/問
  choice: 5, // 選択肢クイズ 5G/問
  listen: 2, // 聞き流し 2G/問
  blank: 5,  // 穴抜けクイズ 5G/問
};

// セッション報酬 = 問題数 × 1問あたり金額
export function sessionGold(
  mode: StudyMode,
  count: number,
  _jobLevel?: number,
): number {
  return count * MODE_BASE_GOLD[mode];
}

// ---------- 苦手判定（単語帳・穴抜け問題 共通） ----------
// 登録: セッション内でこの回数だけ間違えた時点で苦手登録
export const DEFAULT_WEAK_THRESHOLD = 3;
export const MIN_WEAK_THRESHOLD = 1;
export const MAX_WEAK_THRESHOLD = 10;
// 解除: 「新しいセッションで最初の挑戦が正解」がこの回数連続したら苦手解除
// （間に1回でも最初の挑戦が不正解のセッションを挟むと連続カウントは0に戻る）
export const DEFAULT_WEAK_CLEAR_STREAK = 1;
export const MIN_WEAK_CLEAR_STREAK = 1;
export const MAX_WEAK_CLEAR_STREAK = 10;

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

export const DAY_MS = 86400000;

// 放置ペナルティを何日ぶん適用するか。端数（1日未満）は切り捨てる。
// 呼び出し側は「消化した日数ぶんだけ lastActiveTime を進める」こと。
// now まで進めてしまうと端数が毎回捨てられ、24時間より短い間隔で開いている限り
// ペナルティが永久に発生しなくなる。
export function elapsedPenaltyDays(lastActiveTime: number, now: number): number {
  // 入力を先に検査する。型は number だが、実際にはクラウド/バックアップ由来の JSON が
  // そのまま入るため null や undefined が来うる。
  //  - undefined / NaN → 差が NaN。NaN は `< 1` も `> 0` も false なので呼び出し側の
  //    早期 return をすり抜け、好感度や lastActiveTime 自体を NaN に汚染する
  //  - null → 数値演算で 0 に化けるため「エポックからの経過＝約2万日」と解釈され、
  //    全魚の好感度が 0 になって病気・逃走する（NaN は JSON 化で null になるので、
  //    一度 NaN で汚染されると同期を経てこの経路に入る）
  // どちらも「経過なし」として扱うのが安全。
  if (typeof lastActiveTime !== "number" || !Number.isFinite(lastActiveTime)) return 0;
  const days = Math.floor((now - lastActiveTime) / DAY_MS);
  if (!Number.isFinite(days)) return 0;
  return Math.max(0, days);
}

export function calculateOfflineEffects(
  fishList: Fish[],
  lastActiveTime: number,
  now: number,
  buffs: { decay_reduction?: number; disease_resistance?: number } = {}
): Fish[] {
  const elapsedDays = elapsedPenaltyDays(lastActiveTime, now);

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
        // 0 は falsy なので || だと epoch(0) の記録を now で潰してしまう
        fish.sickStartTime = fish.sickStartTime ?? now;
      }
    }

    // 野生復帰チェック（72時間 = 3日 上限）
    // sickStartTime が 0 のとき falsy 判定だと逃走チェックごと飛ばしてしまうため null 比較にする
    if (fish.isSick && fish.sickStartTime != null) {
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
// 価格が高いほどレアが出やすい重みテーブルを持つ。海水/淡水ガチャは水の種類を限定する。
export type GachaTier = "cheap" | "normal" | "premium" | "saltwater" | "freshwater";

export interface GachaInfo {
  label: string;
  price: number;
  icon: string;
  weights: Record<"激安" | "普通" | "高級" | "ロマン", number>;
  desc: string;
  waterType?: import("./types").WaterType; // 指定時はその水の種類の魚だけが出る
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
  saltwater: {
    label: "海水ガチャ",
    price: 700,
    icon: "🌊",
    weights: { 激安: 0, 普通: 60, 高級: 35, ロマン: 15 },
    desc: "海水魚だけが出る。高級・ロマンも狙える。",
    waterType: "saltwater",
  },
  freshwater: {
    label: "淡水ガチャ",
    price: 700,
    icon: "🌿",
    weights: { 激安: 0, 普通: 60, 高級: 35, ロマン: 15 },
    desc: "淡水魚だけが出る。高級・ロマンも狙える。",
    waterType: "freshwater",
  },
};

// ---------- ショップ価格 ----------
export const SHOP_PRICES = {
  baitBasic10: 50, // ベーシック餌×10
  baitPremium5: 180, // 高級フレーク×5
  medicine: 300, // おくすり
  tankExpansion: 1200, // 水槽拡張キット（実価格は tankExpansionPrice() で計算。常に固定）
  boxExpansion: 800, // ボックス拡張キット（常に800G固定）
  freshwaterTank: 3000, // 淡水水槽
} as const;

export const MAX_TANK_CAPACITY = 16;

// 所持できる水槽の合計数（海水・淡水の内訳は自由）
export const MAX_TOTAL_TANKS = 10;

// 水槽拡張キットは常に1200G固定
export function tankExpansionPrice(_tankCapacity?: number): number {
  return SHOP_PRICES.tankExpansion;
}

// ---------- ボックス ----------
export const BOX_CAPACITY_INITIAL = 5;

// ボックス拡張キットは常に800G固定（上限なし）
export function boxExpansionPrice(_boxCapacity?: number): number {
  return SHOP_PRICES.boxExpansion;
}
