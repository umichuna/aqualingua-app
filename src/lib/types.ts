// AquaLingua データ型定義
// 仕様書 aqualingua_spec.md §2 のスキーマに準拠。
// lastUpdated は v2 のクラウド同期（LWW）で使うため全レコードに必ず持たせる。

export type WordLevel = "Beginner" | "Intermediate" | "Advanced";

export type WordGenre =
  | "日常会話"
  | "ビジネス"
  | "旅行"
  | "ニュース"
  | "趣味・カルチャー";

export type WordType = "単語" | "述語" | "会話文";

export interface WordExample {
  sentence: string;
  translation: string;
}

export interface Word {
  id: string;
  spelling: string;
  wordType: WordType;
  meanings: string[];
  exampleSentence: string;      // 後方互換フィールド（例文1の英語）
  exampleTranslation: string;   // 後方互換フィールド（例文1の日本語訳）
  examples?: WordExample[];     // 複数例文（未定義なら exampleSentence から生成）
  level: WordLevel;
  genre: WordGenre;
  lastUpdated: number;
}

export interface WordStats {
  wordId: string;
  incorrectCount: number;
  lastReviewedAt: number;
  lastUpdated: number;
}

export type Rarity = "激安" | "普通" | "高級" | "ロマン";
export type GrowthStage = "幼魚" | "成魚";
export type FishStatus = "swimming" | "eating" | "running_away";

export interface Fish {
  fishId: string;
  name: string;
  type: string; // fishMaster の種類名
  rarity: Rarity;
  growthStage: GrowthStage;
  level: number; // 1〜30
  affection: number; // 0〜100
  status: FishStatus;
  isSick: boolean;
  sickStartTime: number | null;
  lastUpdated: number;
}

export interface EncyclopediaEntry {
  fishType: string;
  discoveredAt: number;
  lastUpdated: number;
}

// 所持アイテム（MVP拡張: 仕様書のショップ要件を満たすために追加）
export interface UserItems {
  baitBasic: number; // ベーシック餌（好感度+5）
  baitPremium: number; // 高級フレーク（好感度+15）
  medicine: number; // おくすり（病気治療）
}

export interface UserStatus {
  userId: string;
  gold: number;
  jobLevel: number; // 1〜10
  achievedTitles: string[];
  lastActiveTime: number;
  lastUpdated: number;
  // --- MVP拡張フィールド ---
  items: UserItems;
  tankCapacity: number; // 飼育上限（拡張キットで+2）
  totalStudyCount: number; // 学習完了の累計（ジョブLvの昇格に使用）
  lastRewardDate: string; // デイリーリワード受取日 "YYYY-MM-DD"
  onboardingDone: boolean;
}

export type StudyMode = "self" | "choice" | "listen";

// しごとセッションの記録（記録画面の統計・カレンダーに使用）
export interface StudySession {
  sessionId: string;
  date: string; // "YYYY-MM-DD"
  timestamp: number;
  mode: StudyMode | "free"; // free = フリーしごと
  label: string; // フリーしごとの内容（例: 筋トレ）。通常モードはモード名
  count: number; // 出題数（フリーは0）
  correctCount: number; // 正解数（自己採点=わかった数。フリーは0）
  goldEarned: number;
  lastUpdated: number;
}

// 歴代おさかな履歴（出荷・逃走したおさかなの記録）
export type FishLeaveReason = "shipped" | "runaway";

export interface FishHistoryEntry {
  entryId: string;
  fishType: string;
  name: string;
  reason: FishLeaveReason;
  date: string; // "YYYY-MM-DD"
  timestamp: number;
  lastUpdated: number;
}

// ゴールド通帳（入出金履歴）
export interface GoldLedgerEntry {
  entryId: string;
  date: string; // "YYYY-MM-DD"
  timestamp: number;
  amount: number; // 入金は正、出金は負
  reason: string; // 例: "自己採点 10問" "プレミアムガチャ" "デイリーリワード"
  balance: number; // 取引後の残高
  lastUpdated: number;
}
