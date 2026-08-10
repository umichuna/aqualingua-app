"use client";

// アプリ全体の状態管理。IndexedDB（lib/db.ts）から読み込み、
// 変更のたびに書き戻す（write-through）。全ビューはこのContextを使う。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { FISH_MASTER, rollGachaWithWeights, type FishMaster } from "@/data/fishMaster";
import {
  ACHIEVEMENTS,
  checkNewAchievements,
  buildAchievementStats,
} from "@/data/achievements";
import {
  ADULT_LEVEL,
  AFFECTION_GAIN_RATE,
  BAIT_EFFECT,
  BOX_CAPACITY_INITIAL,
  boxExpansionPrice,
  calculateOfflineEffects,
  DEFAULT_WEAK_CLEAR_STREAK,
  type GachaTier,
  GACHA_TIERS,
  jobLevelFor,
  MAX_AFFECTION,
  MAX_FISH_LEVEL,
  MAX_TANK_CAPACITY,
  MAX_TOTAL_TANKS,
  resolveTankId,
  sessionGold,
  SHOP_PRICES,
  tankExpansionPrice,
  titlesFor,
  todayString,
} from "@/lib/gameLogic";
import {
  clearAllData,
  createInitialUserStatus,
  deleteFish as dbDeleteFish,
  deleteBlankQuestion,
  deleteBlankQuestions,
  deleteWord as dbDeleteWord,
  discoverFishType,
  getAllBlankQuestions,
  getAllBlankQuestionStats,
  getAllEncyclopedia,
  getAllFish,
  getAllFishHistory,
  getAllFishOverrides,
  getAllSharedCustomFish,
  replaceSharedCustomFish,
  putFishOverridesBulk,
  getAllGoldLedger,
  getAllStudySessions,
  getAllWordStats,
  getAllWords,
  getUserStatus,
  putBlankQuestion,
  putBlankQuestions,
  putBlankQuestionStats,
  putFish,
  putFishHistoryEntry,
  putFishList,
  deleteFishOverride,
  putFishOverride,
  putGoldLedgerEntry,
  putEncyclopediaEntry,
  putStudySession,
  putUserStatus,
  putWord,
  putWords,
  putWordStats,
} from "@/lib/db";
import { sfx } from "@/lib/sound";
import { friendlySyncErrorMessage, pullFromCloud, pushToCloud } from "@/lib/sync";
import { deleteSharedCustomFish, fetchSharedCustomFish, postSharedCustomFish } from "@/lib/customFish";
import { deleteSharedFishOverride, fetchSharedFishOverrides, postSharedFishOverride } from "@/lib/fishOverrides";
import type {
  BlankQuestion,
  BlankQuestionStats,
  CustomFishDef,
  EncyclopediaEntry,
  Fish,
  FishHistoryEntry,
  FishLeaveReason,
  FishOverride,
  GoldLedgerEntry,
  StudyMode,
  StudySession,
  Tank,
  UserStatus,
  Word,
  WordStats,
  WaterType,
} from "@/lib/types";

// しごとモードの表示名（通帳・記録の表示に使用）
export const MODE_LABEL: Record<StudyMode, string> = {
  self: "自己採点",
  choice: "選択肢クイズ",
  listen: "聞き流し",
  blank: "穴抜けクイズ",
};

export type BaitKind = "basic" | "premium";

export interface GameNotice {
  id: number;
  icon: string;
  text: string;
}

interface GameContextValue {
  ready: boolean;
  fishDataReady: boolean;
  user: UserStatus;
  fishList: Fish[];
  words: Word[];
  wordStats: Record<string, WordStats>;
  encyclopedia: EncyclopediaEntry[];
  fishHistory: FishHistoryEntry[];
  studySessions: StudySession[];
  goldLedger: GoldLedgerEntry[];
  notices: GameNotice[];
  dismissNotice: (id: number) => void;
  pushNotice: (icon: string, text: string) => void;

  // ユーザー・経済
  updateUser: (patch: Partial<UserStatus>) => void;
  completeStudy: (
    mode: StudyMode,
    questionCount: number,
    correctCount: number
  ) => { gold: number; leveledUp: boolean; newTitles: string[]; sessionId: string };
  completeFreeWork: (label: string, amount: number) => { sessionId: string };
  patchStudySession: (sessionId: string, patch: Partial<StudySession>) => void;
  addManualSession: (date: string, label: string, count: number) => void;

  // 水槽
  tanks: Tank[];
  currentTankId: string;
  setCurrentTankId: (id: string) => void;
  moveFishToTank: (fishId: string, targetTankId: string) => void;
  buyTank: (type: WaterType) => boolean;
  renameTank: (tankId: string, newName: string) => void;
  setBackgroundImage: (tankId: string, base64: string) => void;
  feedAllFish: (kind: BaitKind) => boolean;
  useMedicine: (fishId: string) => boolean;
  moveTankFishToBox: (fishId: string) => void;
  renameFish: (fishId: string, name: string) => void;
  removeFish: (fishId: string) => void;
  buyGachaFish: (tier: GachaTier) => FishMaster | null;
  addFishToTank: (master: FishMaster, name: string) => void;
  addFishToBox: (master: FishMaster, name: string) => void;
  moveBoxFishToTank: (fishId: string, targetTankId: string) => boolean;
  releaseBoxFish: (fishId: string) => void;

  // ショップ
  buyItem: (item: keyof typeof SHOP_PRICES) => boolean;

  // 単語
  saveWord: (word: Word) => void;
  saveWords: (words: Word[]) => void;
  removeWord: (id: string) => void;
  removeWords: (ids: string[]) => void;
  recordAnswer: (wordId: string, correct: boolean) => void;
  registerWordFirstTryOutcome: (wordId: string, correct: boolean) => void;
  allGenres: string[]; // 単語データ + customGenres から自動生成
  addCustomGenre: (genre: string) => void;
  addCustomGenres: (genres: string[]) => void;
  removeCustomGenre: (genre: string, clearWords?: boolean) => void;

  // 管理者
  allFishMaster: FishMaster[];
  addCustomFish: (def: CustomFishDef) => void;
  updateCustomFish: (def: CustomFishDef) => void;
  removeCustomFish: (fishType: string) => void;
  updateBuiltinFish: (override: FishOverride) => void;
  removeBuiltinFishOverride: (fishType: string) => void;

  // 穴抜け問題
  blankQuestions: BlankQuestion[];
  blankQuestionStats: Record<string, BlankQuestionStats>;
  addBlankQuestion: (q: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">) => void;
  importBlankQuestions: (qs: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">[]) => void;
  updateBlankQuestion: (q: BlankQuestion) => void;
  upsertBlankQuestions: (rows: BlankQuestion[]) => void;
  removeBlankQuestion: (id: string) => void;
  removeBlankQuestions: (ids: string[]) => void;
  recordBlankAnswer: (id: string, correct: boolean) => void;
  registerBlankFirstTryOutcome: (id: string, correct: boolean) => void;

  // 実績
  claimAchievementReward: (achievementId: string) => void;

  // その他
  resetAllData: () => Promise<void>;
  syncNow: () => Promise<void>;
  pushNow: () => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}


let noticeSeq = 1;

// ---- クラウド取得の間引き（Azure SQL 無料枠の節約） ----
// 魚の共有データ（fishOverrides / sharedCustomFish）は起動のたびに取得すると
// DBが毎回起こされて無料枠（月10万vCore秒）を消費するため、24時間に1回に間引く。
// サーバーレスDBは「起きている時間」で課金され、自動一時停止までの待機時間も課金対象に
// なるため、クエリ本数より「起こす回数」を減らすほうが効く。
// ローカルキャッシュ（IndexedDB）があるので、間引き中も表示は正しく出る。
// すぐ最新にしたいときは手動の☁️同期を押せば、この間隔を無視して取り直す
// （pull で既にDBが起きているので追加コストはほぼ無い）。
const CLOUD_FISH_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
function shouldRefreshCloudFish(key: "fishOverrides" | "customFish"): boolean {
  try {
    // 手動同期が「次は間隔を無視して取得する」印を付けていたら、その印を消して取得する
    if (localStorage.getItem(`cloudFishForceRefresh:${key}`)) {
      localStorage.removeItem(`cloudFishForceRefresh:${key}`);
      return true;
    }
    const at = Number(localStorage.getItem(`cloudFishFetchedAt:${key}`) ?? 0);
    return Date.now() - at > CLOUD_FISH_REFRESH_INTERVAL_MS;
  } catch {
    return true; // localStorage が使えない環境では従来通り取得
  }
}

// 手動の☁️同期で呼ぶ。次回の共有魚チェックで間隔を無視して取り直させる。
// 取得日時（cloudFishFetchedAt）は消さないこと。消すと、取得に失敗したときに
// 間引き自体が解除され、以後アプリを開くたびにDBを起こしに行ってしまう
// （＝無料枠を節約したいのに逆効果になる）。フラグ1つで1回だけ取りに行かせる。
function requestCloudFishRefresh(): void {
  try {
    for (const key of ["fishOverrides", "customFish"] as const) {
      localStorage.setItem(`cloudFishForceRefresh:${key}`, "1");
    }
  } catch {
    // localStorage が使えない環境では元々毎回取得するので何もしなくてよい
  }
}
function markCloudFishRefreshed(key: "fishOverrides" | "customFish"): void {
  try {
    localStorage.setItem(`cloudFishFetchedAt:${key}`, String(Date.now()));
  } catch {
    // 保存できなくても致命的ではない（次回も取得されるだけ）
  }
}

// ---- 拡張パック(容量)の復旧 ----
// 同期バグで tankCapacity/boxCapacity が巻き戻ることがある。
// 通帳（購入記録は消えない）から本来の容量を計算し、現在値が下回っていたら戻す。
// 初期ロード時だけでなく、☁️同期（pull）でクラウドの古い値を取り込んだ直後にも
// 呼び出せるよう、コンポーネント外の純粋関数として切り出す。
function recoverExpansionCapacity(
  user: UserStatus,
  ledger: GoldLedgerEntry[]
): { user: UserStatus; changed: boolean } {
  const tankBuys = ledger.filter((e) => e.reason === "水槽拡張キット").length;
  const boxBuys = ledger.filter((e) => e.reason === "ボックス拡張キット").length;
  const expectedTank = Math.min(MAX_TANK_CAPACITY, 4 + tankBuys * 2);
  const expectedBox = BOX_CAPACITY_INITIAL + boxBuys * 5;
  let next = user;
  let changed = false;
  if (next.tankCapacity < expectedTank) {
    console.warn(`[Recover] tankCapacity ${next.tankCapacity} → ${expectedTank}（通帳の拡張購入 ${tankBuys}回から復旧）`);
    next = { ...next, tankCapacity: expectedTank };
    changed = true;
  }
  const curBox = next.boxCapacity ?? BOX_CAPACITY_INITIAL;
  if (curBox < expectedBox) {
    console.warn(`[Recover] boxCapacity ${curBox} → ${expectedBox}（通帳の拡張購入 ${boxBuys}回から復旧）`);
    next = { ...next, boxCapacity: expectedBox };
    changed = true;
  }

  // 水槽そのもの（3000G）も通帳から復旧する。容量と違い、消えると購入分が丸損になるため。
  // 通帳の文言は現行が「海水 2水槽追加」、旧実装が「海水水槽追加」なので、
  // 末尾一致＋先頭の水種で両方を拾う。
  // tanks が未設定の旧データは、水種別カウント（saltwaterTankCount 等）から
  // 既定の水槽リストが導出される仕組みなのでここでは触らない。
  if (next.tanks?.length) {
    const tankAdds = ledger.filter((e) => e.reason.endsWith("水槽追加"));
    const expected: Record<WaterType, number> = {
      saltwater: 1 + tankAdds.filter((e) => e.reason.startsWith("海水")).length, // 初期1槽 + 購入分
      freshwater: tankAdds.filter((e) => e.reason.startsWith("淡水")).length,
    };
    const restored = [...next.tanks];
    for (const type of ["saltwater", "freshwater"] as const) {
      for (let i = restored.filter((t) => t.type === type).length; i < expected[type]; i++) {
        if (restored.length >= MAX_TOTAL_TANKS) break; // 合計上限は超えない
        const idx = i + 1;
        const id = `${type === "saltwater" ? "sw" : "fw"}-${idx}`;
        if (restored.some((t) => t.id === id)) continue; // 同じIDは作らない
        const name = type === "saltwater" ? `海水 ${idx}` : `淡水 ${idx}`;
        console.warn(`[Recover] 水槽 ${name} を通帳の購入記録から復旧`);
        restored.push({ id, type, name });
      }
    }
    if (restored.length !== next.tanks.length) {
      next = { ...next, tanks: restored };
      changed = true;
    }
  }
  if (changed) {
    // 補正・復旧したデータは「新しい変更」として扱う（古い日時のまま保存すると
    // 同期で巻き戻る原因になるため、lastUpdated を現在時刻に更新する）
    next = { ...next, lastUpdated: Date.now() };
  }
  return { user: next, changed };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [ready, setReady] = useState(false);
  // 組み込み魚オーバーライド・共有カスタム魚の初回取得が終わるまで水槽描画を待たせるゲート。
  // これが無いと、ローカルDB読み込み完了(ready)直後にクラウド取得が終わる前の
  // allFishMaster（編集前の画像・カスタム魚なし）で一瞬だけ魚が描画されてしまう。
  const [fishDataReady, setFishDataReady] = useState(false);
  // ローカルキャッシュ（前回クラウドから取得して保存した編集内容・カスタム魚）の読み込みが
  // 終わった時点で表示を開始する。クラウド取得の完了は待たない（コールドスタートで数十秒
  // かかっても、ローカルキャッシュがあれば正しい画像を即座に出せる）。クラウド分は裏で更新。
  const fishDataReadySourcesRef = useRef({ localOverrides: false, localCustomFish: false });
  const markFishDataSourceSettled = useCallback((key: "localOverrides" | "localCustomFish") => {
    fishDataReadySourcesRef.current[key] = true;
    const s = fishDataReadySourcesRef.current;
    if (s.localOverrides && s.localCustomFish) {
      setFishDataReady(true);
    }
  }, []);
  useEffect(() => {
    // 回線が遅い/クラウドがコールドスタート中でも読み込み画面が固まらないよう、
    // 短いタイムアウトで強制的に表示を進める（その後リトライで裏側から正しい画像に切り替わる）
    const t = setTimeout(() => setFishDataReady(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const [user, setUser] = useState<UserStatus>(createInitialUserStatus);
  const [fishList, setFishList] = useState<Fish[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [wordStats, setWordStats] = useState<Record<string, WordStats>>({});
  const [encyclopedia, setEncyclopedia] = useState<EncyclopediaEntry[]>([]);
  const [fishHistory, setFishHistory] = useState<FishHistoryEntry[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [goldLedger, setGoldLedger] = useState<GoldLedgerEntry[]>([]);
  const [notices, setNotices] = useState<GameNotice[]>([]);
  // 全員共有のカスタム魚（クラウドの shared_custom_fish から取得）
  const [sharedCustomFish, setSharedCustomFish] = useState<CustomFishDef[]>([]);
  // 組み込み魚のオーバーライド（編集用）
  const [fishOverrides, setFishOverrides] = useState<FishOverride[]>([]);
  const [blankQuestions, setBlankQuestions] = useState<BlankQuestion[]>([]);
  const [blankQuestionStats, setBlankQuestionStats] = useState<Record<string, BlankQuestionStats>>({});
  const [currentTankId, setCurrentTankId] = useState<string>("sw-1");
  const currentTankIdRef = useRef(currentTankId);
  useEffect(() => { currentTankIdRef.current = currentTankId; }, [currentTankId]);
  const userRef = useRef(user);
  const fishRef = useRef(fishList);
  const allFishMasterRef = useRef<FishMaster[]>(FISH_MASTER);
  useEffect(() => {
    userRef.current = user;
    fishRef.current = fishList;
  }, [user, fishList]);
  const sharedCustomFishRef = useRef<CustomFishDef[]>(sharedCustomFish);
  useEffect(() => { sharedCustomFishRef.current = sharedCustomFish; }, [sharedCustomFish]);
  // ログイン直後の「全員共有カスタム魚を取得」は数十秒かかることがある（Azure SQL
  // コールドスタート）。その最中にユーザーが自分のカスタム魚を編集・追加・削除すると、
  // 後から届く古いフェッチ結果で上書きされ、編集が消えたように見えるバグがあった。
  // 編集した type を記録しておき、フェッチ結果の反映時に上書きしないようにする。
  const locallyModifiedFishTypesRef = useRef<Set<string>>(new Set());
  // 実績報酬の受け取り処理中のID（同一tick内の二度押しによる魚の重複付与を防ぐ）
  const claimingAchievementsRef = useRef<Set<string>>(new Set());
  // 手動の☁️同期で共有魚（fishOverrides / sharedCustomFish）を取り直させるためのカウンタ。
  // 取得を24時間に間引いている分、「今すぐ最新にしたい」に応えられるようにする。
  const [sharedFishTick, setSharedFishTick] = useState(0);

  const tanks = useMemo<Tank[]>(() => {
    if (user.tanks?.length) return user.tanks;
    const swCount = user.saltwaterTankCount ?? 1;
    const fwCount = user.freshwaterTankCount ?? (user.hasFreshwaterTank ? 1 : 0);
    const result: Tank[] = [];
    for (let i = 1; i <= swCount; i++) result.push({ id: `sw-${i}`, type: "saltwater", name: `海水 ${i}` });
    for (let i = 1; i <= fwCount; i++) result.push({ id: `fw-${i}`, type: "freshwater", name: `淡水 ${i}` });
    return result;
  }, [user.tanks, user.saltwaterTankCount, user.freshwaterTankCount, user.hasFreshwaterTank]);
  const tanksRef = useRef<Tank[]>(tanks);
  useEffect(() => { tanksRef.current = tanks; }, [tanks]);

  const pushNotice = useCallback((icon: string, text: string) => {
    const id = noticeSeq++;
    setNotices((n) => [...n, { id, icon, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((n) => n.filter((x) => x.id !== id));
  }, []);

  // 自動同期は無効。手動同期のみ（syncNow ボタンで実行）
  const schedulePush = useCallback(() => {}, []);

  // ---------- 永続化ヘルパー ----------
  const persistUser = useCallback((next: UserStatus) => {
    const stamped = { ...next, lastUpdated: Date.now() };
    setUser(stamped);
    void putUserStatus(stamped);
    schedulePush();
  }, [schedulePush]);

  const persistFishList = useCallback((next: Fish[]) => {
    setFishList(next);
    void putFishList(next);
    schedulePush();
  }, [schedulePush]);

  // ---------- 通帳への記帳 ----------
  const recordLedger = useCallback(
    (amount: number, reason: string, balance: number) => {
      const now = Date.now();
      const entry: GoldLedgerEntry = {
        entryId: crypto.randomUUID(),
        date: todayString(),
        timestamp: now,
        amount,
        reason,
        balance,
        lastUpdated: now,
      };
      setGoldLedger((l) => [...l, entry]);
      void putGoldLedgerEntry(entry);
      schedulePush();
    },
    [schedulePush]
  );

  // ---------- しごとセッションの記録 ----------
  const recordSession = useCallback(
    (
      mode: StudyMode | "free",
      label: string,
      count: number,
      correctCount: number,
      goldEarned: number,
      extra?: { memo?: string; isManual?: boolean; date?: string }
    ): string => {
      const now = Date.now();
      const session: StudySession = {
        sessionId: crypto.randomUUID(),
        date: extra?.date ?? todayString(),
        timestamp: now,
        mode,
        label,
        count,
        correctCount,
        goldEarned,
        memo: extra?.memo,
        isManual: extra?.isManual,
        lastUpdated: now,
      };
      setStudySessions((s) => [...s, session]);
      void putStudySession(session);
      schedulePush();
      return session.sessionId;
    },
    [schedulePush]
  );

  // ---------- 放置ペナルティの適用 ----------
  const applyOfflineEffects = useCallback(
    (currentUser: UserStatus, currentFish: Fish[], now: number) => {
      const updated = calculateOfflineEffects(
        currentFish,
        currentUser.lastActiveTime,
        now,
        { decay_reduction: 0, disease_resistance: 0 }
      );
      const runaways = updated.filter((f) => f.status === "running_away");
      const stayed = updated.filter((f) => f.status !== "running_away");

      if (runaways.length > 0) sfx.sad();
      for (const f of runaways) {
        pushNotice("🌊", `${f.name} は海へ帰ってしまった…`);
        void dbDeleteFish(f.fishId);
        const entry: FishHistoryEntry = {
          entryId: crypto.randomUUID(),
          fishId: f.fishId,
          fishType: f.type,
          name: f.name,
          reason: "runaway" as FishLeaveReason,
          date: todayString(),
          timestamp: Date.now(),
          lastUpdated: Date.now(),
        };
        setFishHistory((h) => [...h, entry]);
        void putFishHistoryEntry(entry);
      }
      const sickNew = stayed.filter(
        (f) =>
          f.isSick && !currentFish.find((c) => c.fishId === f.fishId)?.isSick
      );
      for (const f of sickNew) {
        pushNotice("🤒", `${f.name} が病気になってしまった！おくすりをあげよう`);
      }
      persistFishList(stayed);
      // lastActiveTime だけの更新は lastUpdated を上書きしない（LWW の整合性を守るため）
      const withActive = { ...currentUser, lastActiveTime: now };
      setUser(withActive);
      void putUserStatus(withActive);
    },
    [persistFishList, setUser, pushNotice]
  );

  // ---------- 初期ロード ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [u, fish, ws, stats, enc, history, sessions, ledger] = await Promise.all([
        getUserStatus(),
        getAllFish(),
        getAllWords(),
        getAllWordStats(),
        getAllEncyclopedia(),
        getAllFishHistory(),
        getAllStudySessions(),
        getAllGoldLedger(),
      ]);
      if (cancelled) return;
      const loadedUser = u ?? createInitialUserStatus();
      setWords(ws);
      setWordStats(Object.fromEntries(stats.map((s) => [s.wordId, s])));
      setEncyclopedia(enc);
      setFishHistory(history.sort((a, b) => a.timestamp - b.timestamp));
      setStudySessions(sessions.sort((a, b) => a.timestamp - b.timestamp));
      setGoldLedger(ledger.sort((a, b) => a.timestamp - b.timestamp));
      const now = Date.now();

      // lifetimeGoldEarned が未設定/0 の場合、通帳のプラス合計でバックフィル
      // lifetimeWordsAnswered が未設定/0 の場合、カレンダー記録のcount合計でバックフィル
      let needsSave = false;
      if (!loadedUser.lifetimeGoldEarned && ledger.length > 0) {
        const earned = ledger.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
        if (earned > 0) { loadedUser.lifetimeGoldEarned = earned; needsSave = true; }
      }
      if (!loadedUser.lifetimeWordsAnswered && sessions.length > 0) {
        const answered = sessions.filter((s) => s.mode !== "free").reduce((acc, s) => acc + (s.count ?? 0), 0);
        if (answered > 0) { loadedUser.lifetimeWordsAnswered = answered; needsSave = true; }
      }

      // ---- 拡張パック(容量)の復旧 ----
      const recovery = recoverExpansionCapacity(loadedUser, ledger);
      let finalUser = recovery.user;
      if (recovery.changed) needsSave = true;

      // 補正・復旧したデータは「新しい変更」として扱う（古い日時のまま保存すると
      // 同期で巻き戻る原因になるため、lastUpdated を現在時刻に更新する）
      if (needsSave) {
        finalUser = { ...finalUser, lastUpdated: now };
        void putUserStatus(finalUser);
      }

      if (u) {
        applyOfflineEffects(finalUser, fish, now);
      } else {
        setUser(finalUser);
        setFishList(fish);
      }

      // ローカルDBの読み込みが終わったらすぐに表示
      // 自動同期は完全に無効。クラウドとの同期は「☁️ 同期」ボタン（syncNow）押下時のみ実行する
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // ---------- 全員共有カスタム魚をローカルキャッシュから即読み込み ----------
  // 前回クラウドから取得して保存した魚を、クラウド取得を待たずに即反映する。
  // これで水槽・図鑑を開いた直後から他ユーザー作のカスタム魚も正しい画像で表示される。
  useEffect(() => {
    void getAllSharedCustomFish()
      .then((local) => {
        if (local.length > 0) setSharedCustomFish((prev) => (prev.length ? prev : local));
      })
      .catch((e) => console.error("[CustomFish] local cache load failed", e))
      .finally(() => markFishDataSourceSettled("localCustomFish"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 全員共有のカスタム魚を取得 ----------
  // ログイン中に共有テーブルから取得して全ユーザーのガチャ・図鑑に反映する。
  // さらに、この端末にローカルだけで持っていたカスタム魚を共有へ移行する
  // （以前は個人持ちだったものを全員共有にするため）。
  useEffect(() => {
    if (!session?.user?.email) return;
    if (!shouldRefreshCloudFish("customFish")) return; // 24時間以内に取得済みならスキップ（無料枠節約）
    let cancelled = false;
    (async () => {
      try {
        const shared = await fetchSharedCustomFish();
        if (cancelled) return;
        markCloudFishRefreshed("customFish");
        const sharedTypes = new Set(shared.map((f) => f.type));
        // ローカルにしか無いカスタム魚を共有へアップロード
        const localOnly = (userRef.current.customFish ?? []).filter(
          (f) => !sharedTypes.has(f.type)
        );
        for (const f of localOnly) {
          try {
            await postSharedCustomFish(f);
          } catch (e) {
            console.error("[CustomFish] migrate upload failed", e);
          }
        }
        if (cancelled) return;
        // 共有 + 移行分をマージして state に反映。
        // ただし、このフェッチが進行中にユーザーが自分のカスタム魚を編集・追加・削除
        // していた場合、フェッチ結果は古い可能性があるため、そちらを優先しない
        // （編集済み type は現在のローカル state を採用。削除済みなら含めない）。
        const modifiedTypes = locallyModifiedFishTypesRef.current;
        const currentLocalMap = new Map(sharedCustomFishRef.current.map((f) => [f.type, f]));
        const merged: CustomFishDef[] = [];
        const mergedTypes = new Set<string>();
        for (const f of shared) {
          if (modifiedTypes.has(f.type)) {
            const localVer = currentLocalMap.get(f.type);
            if (localVer) {
              merged.push(localVer);
              mergedTypes.add(f.type);
            }
            // ローカルに無ければフェッチ中に削除された魚なので含めない
          } else {
            merged.push(f);
            mergedTypes.add(f.type);
          }
        }
        for (const f of localOnly) {
          if (!mergedTypes.has(f.type)) {
            merged.push(f);
            mergedTypes.add(f.type);
          }
        }
        // フェッチ中にローカルで新規追加された魚（上のいずれにも含まれない場合）も保持
        for (const f of sharedCustomFishRef.current) {
          if (modifiedTypes.has(f.type) && !mergedTypes.has(f.type)) {
            merged.push(f);
            mergedTypes.add(f.type);
          }
        }
        setSharedCustomFish(merged);
        void replaceSharedCustomFish(merged); // 次回起動用にローカルへキャッシュ
      } catch (e) {
        console.error("[CustomFish] load failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.email, sharedFishTick]);

  // ---------- フォーカス復帰時にも放置チェック ----------
  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        applyOfflineEffects(userRef.current, fishRef.current, Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, applyOfflineEffects]);

  // ---------- ユーザー・経済 ----------
  const updateUser = useCallback(
    (patch: Partial<UserStatus>) => {
      persistUser({ ...userRef.current, ...patch });
    },
    [persistUser]
  );

  const completeStudy = useCallback(
    (mode: StudyMode, questionCount: number, correctCount: number) => {
      const u = userRef.current;
      const gold = sessionGold(mode, questionCount, u.jobLevel);
      const totalStudyCount = u.totalStudyCount + 1;
      const newJobLevel = jobLevelFor(totalStudyCount);
      const leveledUp = newJobLevel > u.jobLevel;
      const titles = titlesFor(totalStudyCount);
      const newTitles = titles.filter((t) => !u.achievedTitles.includes(t));
      persistUser({
        ...u,
        gold: u.gold + gold,
        totalStudyCount,
        jobLevel: newJobLevel,
        achievedTitles: titles,
        lifetimeWordsAnswered: (u.lifetimeWordsAnswered ?? 0) + questionCount,
        lifetimeGoldEarned: (u.lifetimeGoldEarned ?? 0) + gold,
      });
      recordLedger(
        gold,
        `${MODE_LABEL[mode]} ${questionCount}問`,
        u.gold + gold
      );
      const sessionId = recordSession(mode, MODE_LABEL[mode], questionCount, correctCount, gold);
      return { gold, leveledUp, newTitles, sessionId };
    },
    [persistUser, recordLedger, recordSession]
  );

  const completeFreeWork = useCallback(
    (label: string, amount: number) => {
      const u = userRef.current;
      persistUser({
        ...u,
        gold: u.gold + amount,
        lifetimeGoldEarned: (u.lifetimeGoldEarned ?? 0) + amount,
      });
      recordLedger(amount, `フリー: ${label}`, u.gold + amount);
      const sessionId = recordSession("free", label, 0, 0, amount);
      return { sessionId };
    },
    [persistUser, recordLedger, recordSession]
  );

  const patchStudySession = useCallback((sessionId: string, patch: Partial<StudySession>) => {
    setStudySessions((prev) => {
      const next = prev.map((s) =>
        s.sessionId === sessionId ? { ...s, ...patch, lastUpdated: Date.now() } : s
      );
      const updated = next.find((s) => s.sessionId === sessionId);
      if (updated) void putStudySession(updated);
      return next;
    });
    schedulePush();
  }, [schedulePush]);

  const addManualSession = useCallback(
    (date: string, label: string, count: number) => {
      recordSession("free", label, count, 0, 0, { isManual: true, date });
    },
    [recordSession]
  );

  // ---------- 水槽 ----------
  // その種類の魚を最大レベルまで育てたことを図鑑に永続記録する（★表示用）。
  // 一度記録したら二度と消えないので、ボックス移動・出荷・逃走後も★が残る。
  const markMaxLevelReached = useCallback((fishType: string) => {
    setEncyclopedia((enc) => {
      const idx = enc.findIndex((e) => e.fishType === fishType);
      const now = Date.now();
      if (idx === -1) {
        const entry: EncyclopediaEntry = { fishType, discoveredAt: now, maxLevelReachedAt: now, lastUpdated: now };
        void putEncyclopediaEntry(entry);
        return [...enc, entry];
      }
      if (enc[idx].maxLevelReachedAt) return enc; // すでに記録済みなら何もしない（冪等）
      const updated: EncyclopediaEntry = { ...enc[idx], maxLevelReachedAt: now, lastUpdated: now };
      void putEncyclopediaEntry(updated);
      return enc.map((e, i) => (i === idx ? updated : e));
    });
    schedulePush();
  }, [schedulePush]);

  const feedAllFish = useCallback(
    (kind: BaitKind): boolean => {
      const u = userRef.current;
      const itemKey = kind === "basic" ? "baitBasic" : "baitPremium";
      if (u.items[itemKey] <= 0) return false;
      persistUser({
        ...u,
        items: { ...u.items, [itemKey]: u.items[itemKey] - 1 },
      });
      const baseGain = kind === "basic" ? BAIT_EFFECT.basic : BAIT_EFFECT.premium;
      const affection_boost = 0;
      const targetTankId = currentTankIdRef.current;
      const reachedMaxTypes = new Set<string>();
      const next = fishRef.current.map((f) => {
        // 今見ている水槽の魚だけに餌を反映（所属判定は表示側と同じ resolveTankId に統一）
        if (resolveTankId(f, tanksRef.current, allFishMasterRef.current) !== targetTankId) return f;
        const level = Math.min(MAX_FISH_LEVEL, f.level + 1);
        if (level >= MAX_FISH_LEVEL && f.level < MAX_FISH_LEVEL) reachedMaxTypes.add(f.type); // 今回で最大到達
        const grew = f.growthStage === "幼魚" && level >= ADULT_LEVEL;
        if (grew) pushNotice("✨", `${f.name} が成魚に成長した！`);
        const gain = Math.max(1, Math.floor(baseGain * AFFECTION_GAIN_RATE[f.rarity])) + affection_boost;
        return {
          ...f,
          affection: Math.min(MAX_AFFECTION[f.rarity], f.affection + gain),
          level,
          growthStage: grew ? ("成魚" as const) : f.growthStage,
        };
      });
      persistFishList(next);
      reachedMaxTypes.forEach((t) => markMaxLevelReached(t));
      return true;
    },
    [persistUser, persistFishList, pushNotice, markMaxLevelReached]
  );

  const useMedicine = useCallback(
    (fishId: string): boolean => {
      const u = userRef.current;
      if (u.items.medicine <= 0) return false;
      const fish = fishRef.current.find((f) => f.fishId === fishId);
      if (!fish || !fish.isSick) return false;
      persistUser({
        ...u,
        items: { ...u.items, medicine: u.items.medicine - 1 },
      });
      const next = fishRef.current.map((f) =>
        f.fishId === fishId
          ? { ...f, isSick: false, sickStartTime: null }
          : f
      );
      persistFishList(next);
      sfx.heal();
      pushNotice("💊", `${fish.name} の病気が治った！`);
      return true;
    },
    [persistUser, persistFishList, pushNotice]
  );

  const renameFish = useCallback(
    (fishId: string, name: string) => {
      const next = fishRef.current.map((f) =>
        f.fishId === fishId ? { ...f, name } : f
      );
      persistFishList(next);
    },
    [persistFishList]
  );

  const removeFish = useCallback((fishId: string) => {
    setFishList((list) => list.filter((f) => f.fishId !== fishId));
    void dbDeleteFish(fishId);
  }, []);

  const moveTankFishToBox = useCallback(
    (fishId: string) => {
      const fish = fishRef.current.find((f) => f.fishId === fishId);
      if (!fish) return;
      const u = userRef.current;
      setFishList((list) => list.filter((f) => f.fishId !== fishId));
      void dbDeleteFish(fishId);
      persistUser({ ...u, boxFish: [...(u.boxFish ?? []), fish] });
      pushNotice("📦", `${fish.name} をボックスに入れました`);
    },
    [persistUser, pushNotice]
  );

  const addFishToTank = useCallback(
    (master: FishMaster, name: string) => {
      const now = Date.now();
      // 現在表示中の水槽が魚の水の種類と合わない場合（例: 淡水水槽を見ている時に
      // 海水魚を獲得）は、同じ水の種類の水槽に入れる（無ければ現在の水槽のまま）。
      const fishWaterType = master.waterType ?? "saltwater";
      const currentTank = tanksRef.current.find(t => t.id === currentTankIdRef.current);
      const targetTankId =
        currentTank && currentTank.type === fishWaterType
          ? currentTankIdRef.current
          : (tanksRef.current.find(t => t.type === fishWaterType)?.id ?? currentTankIdRef.current);
      const fish: Fish = {
        fishId: crypto.randomUUID(),
        name,
        type: master.type,
        rarity: master.rarity,
        growthStage: "幼魚",
        level: 1,
        affection: 10,
        status: "swimming",
        isSick: false,
        sickStartTime: null,
        lastUpdated: now,
        tankId: targetTankId,
      };
      // 関数型更新：同一同期パスで複数実績の魚を続けて付与しても消えない（B3対策）
      setFishList((list) => [...list, fish]);
      void putFish(fish);
      void discoverFishType(master.type);
      setEncyclopedia((enc) =>
        enc.some((e) => e.fishType === master.type)
          ? enc
          : [...enc, { fishType: master.type, discoveredAt: now, lastUpdated: now }]
      );
      schedulePush();
    },
    [schedulePush]
  );

  const addFishToBox = useCallback(
    (master: FishMaster, name: string) => {
      const now = Date.now();
      const fish: Fish = {
        fishId: crypto.randomUUID(),
        name,
        type: master.type,
        rarity: master.rarity,
        growthStage: "幼魚",
        level: 1,
        affection: 10,
        status: "swimming",
        isSick: false,
        sickStartTime: null,
        lastUpdated: now,
      };
      // 関数型更新：boxFish のlost-updateと、外側で追記した unlockedAchievements の
      // 巻き戻しを防ぐ（B4対策）。putUserStatus は冪等なDB書き込みなのでupdater内で呼んでよい。
      setUser((u) => {
        const updated = {
          ...u,
          boxFish: [...(u.boxFish ?? []), fish],
          lastUpdated: Date.now(),
        };
        void putUserStatus(updated);
        return updated;
      });
      void discoverFishType(master.type);
      setEncyclopedia((enc) =>
        enc.some((e) => e.fishType === master.type)
          ? enc
          : [...enc, { fishType: master.type, discoveredAt: now, lastUpdated: now }]
      );
      pushNotice("📦", `${name} はボックスに入った！水槽に空きができたら移せるよ`);
    },
    [pushNotice]
  );

  const moveBoxFishToTank = useCallback(
    (fishId: string, targetTankId: string): boolean => {
      const u = userRef.current;
      const boxFish = (u.boxFish ?? []).find((f) => f.fishId === fishId);
      if (!boxFish) return false;
      // 対象タンク情報を取得
      const targetTank = (u.tanks ?? []).find(t => t.id === targetTankId);
      if (!targetTank) return false;
      // 魚の水の種類を取得（海水/淡水）
      const fishMaster = allFishMasterRef.current.find(m => m.type === boxFish.type);
      const fishWaterType = fishMaster?.waterType ?? "saltwater";
      // 魚の水の種類とタンクの種類が一致しているか確認
      if (fishWaterType !== targetTank.type) {
        pushNotice("💧", `${fishWaterType === "saltwater" ? "海水" : "淡水"}魚は${targetTank.type === "saltwater" ? "海水" : "淡水"}水槽に入りません`);
        return false;
      }
      // タンクの容量をチェック（上限は口座共通の tankCapacity を各水槽で参照）
      const tankFishCount = fishRef.current.filter(
        (f) => resolveTankId(f, tanksRef.current, allFishMasterRef.current) === targetTankId
      ).length;
      if (tankFishCount >= u.tankCapacity) return false;
      const newBoxFish = (u.boxFish ?? []).filter((f) => f.fishId !== fishId);
      persistUser({ ...u, boxFish: newBoxFish });
      const next = [...fishRef.current, { ...boxFish, tankId: targetTankId }];
      setFishList(next);
      void putFish({ ...boxFish, tankId: targetTankId });
      pushNotice("🐠", `${boxFish.name} が水槽に移った！`);
      return true;
    },
    [persistUser, pushNotice]
  );

  const buyGachaFish = useCallback((tier: GachaTier): FishMaster | null => {
    const u = userRef.current;
    const info = GACHA_TIERS[tier];
    if (u.gold < info.price) return null;
    persistUser({ ...u, gold: u.gold - info.price });
    recordLedger(-info.price, info.label, u.gold - info.price);
    // 共有カスタム魚を含む最新の一覧から抽選する（海水/淡水ガチャは水の種類で絞り込み）
    return rollGachaWithWeights(info.weights, allFishMasterRef.current, info.waterType);
  }, [persistUser, recordLedger]);

  // ---------- ショップ ----------
  const buyItem = useCallback(
    (item: keyof typeof SHOP_PRICES): boolean => {
      const u = userRef.current;
      let price: number;
      if (item === "tankExpansion") {
        price = tankExpansionPrice(u.tankCapacity);
      } else if (item === "boxExpansion") {
        price = boxExpansionPrice(u.boxCapacity ?? BOX_CAPACITY_INITIAL);
      } else {
        price = SHOP_PRICES[item];
      }
      if (u.gold < price) return false;
      const items = { ...u.items };
      let tankCapacity = u.tankCapacity;
      let boxCapacity = u.boxCapacity ?? BOX_CAPACITY_INITIAL;
      let label = "";
      switch (item) {
        case "baitBasic10":
          items.baitBasic += 10;
          label = "ベーシック餌 ×10";
          break;
        case "baitPremium5":
          items.baitPremium += 5;
          label = "高級フレーク ×5";
          break;
        case "medicine":
          items.medicine += 1;
          label = "おくすり";
          break;
        case "tankExpansion":
          if (tankCapacity >= MAX_TANK_CAPACITY) return false;
          tankCapacity = Math.min(MAX_TANK_CAPACITY, tankCapacity + 2);
          label = "水槽拡張キット";
          break;
        case "boxExpansion":
          boxCapacity = boxCapacity + 5;
          label = "ボックス拡張キット";
          break;
        case "freshwaterTank":
          if (u.hasFreshwaterTank) return false;
          label = "淡水水槽";
          persistUser({ ...u, gold: u.gold - price, hasFreshwaterTank: true });
          recordLedger(-price, label, u.gold - price);
          return true;
        default:
          return false;
      }
      persistUser({ ...u, gold: u.gold - price, items, tankCapacity, boxCapacity });
      recordLedger(-price, label, u.gold - price);
      return true;
    },
    [persistUser, recordLedger]
  );

  // ---------- 単語 ----------
  // 削除済み単語の墓標。同期時に「別端末がまだ持っている単語の復活」を防ぐために使う。
  // userStatus は1件のJSONとしてクラウドへ送るため、無制限に増やすと同期が重くなる。
  // 古いものから捨てて上限までに収める（古い削除は他端末にも既に伝わっている想定）。
  const MAX_DELETED_WORD_IDS = 1000;
  const appendDeletedWordIds = useCallback(
    (u: UserStatus, ids: string[]): string[] => {
      const merged = [...(u.deletedWordIds ?? []), ...ids];
      return merged.length > MAX_DELETED_WORD_IDS
        ? merged.slice(merged.length - MAX_DELETED_WORD_IDS)
        : merged;
    },
    []
  );

  // 同じIDで単語を再登録したら墓標から外す（CSV往復編集などで意図的に戻した場合に、
  // 同期のたびに消され続けるのを防ぐ）
  const forgetDeletedWordIds = useCallback((ids: string[]) => {
    const u = userRef.current;
    const tomb = u.deletedWordIds ?? [];
    if (tomb.length === 0) return;
    const idSet = new Set(ids);
    const next = tomb.filter((id) => !idSet.has(id));
    if (next.length !== tomb.length) persistUser({ ...u, deletedWordIds: next });
  }, [persistUser]);

  const saveWord = useCallback((word: Word) => {
    const now = Date.now();
    // createdAt は初回のみセット。編集時は既存値を保持して登録日順ソートを正しく機能させる
    setWords((ws) => {
      const i = ws.findIndex((w) => w.id === word.id);
      const existing = i >= 0 ? ws[i] : undefined;
      const wordToSave: Word = {
        ...word,
        createdAt: word.createdAt ?? existing?.createdAt ?? now,
        lastUpdated: now,
      };
      if (i >= 0) {
        const next = [...ws];
        next[i] = wordToSave;
        return next;
      }
      return [...ws, wordToSave];
    });
    void putWord({ ...word, createdAt: word.createdAt ?? now, lastUpdated: now });
    forgetDeletedWordIds([word.id]);
    schedulePush();
  }, [schedulePush, forgetDeletedWordIds]);

  const saveWords = useCallback((newWords: Word[]) => {
    setWords((ws) => {
      const map = new Map(ws.map((w) => [w.id, w]));
      for (const w of newWords) map.set(w.id, w);
      return Array.from(map.values());
    });
    void putWords(newWords);
    forgetDeletedWordIds(newWords.map((w) => w.id));
    schedulePush();
  }, [schedulePush, forgetDeletedWordIds]);

  const removeWord = useCallback((id: string) => {
    setWords((ws) => ws.filter((w) => w.id !== id));
    setWordStats((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    void dbDeleteWord(id);
    const u = userRef.current;
    persistUser({ ...u, deletedWordIds: appendDeletedWordIds(u, [id]) });
  }, [persistUser, appendDeletedWordIds]);

  // 一括削除（バッチ）：state更新1回・UserStatus書き込み1回で重い再描画/書き込みループを解消
  const removeWords = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setWords((ws) => ws.filter((w) => !idSet.has(w.id)));
    setWordStats((s) => {
      const next = { ...s };
      for (const id of ids) delete next[id];
      return next;
    });
    for (const id of ids) void dbDeleteWord(id);
    const u = userRef.current;
    persistUser({ ...u, deletedWordIds: appendDeletedWordIds(u, ids) });
  }, [persistUser, appendDeletedWordIds]);

  const recordAnswer = useCallback((wordId: string, correct: boolean) => {
    setWordStats((s) => {
      const prev = s[wordId] ?? {
        wordId,
        incorrectCount: 0,
        lastReviewedAt: 0,
        lastUpdated: 0,
      };
      const next: WordStats = {
        ...prev,
        incorrectCount: prev.incorrectCount + (correct ? 0 : 1),
        lastReviewedAt: Date.now(),
        lastUpdated: Date.now(),
      };
      void putWordStats(next);
      return { ...s, [wordId]: next };
    });
    schedulePush();
  }, [schedulePush]);

  // 「新しいセッションでの最初の挑戦」の正誤を渡す。設定の解除条件（連続正解セッション数）
  // に達したら苦手解除。不正解なら連続カウントを0に戻す。苦手でない単語には何もしない。
  const registerWordFirstTryOutcome = useCallback((wordId: string, correct: boolean) => {
    const clearStreak = userRef.current.weakClearStreak ?? DEFAULT_WEAK_CLEAR_STREAK;
    setWordStats((s) => {
      const prev = s[wordId];
      if (!prev || prev.incorrectCount === 0) return s;
      const now = Date.now();
      if (correct) {
        const streak = (prev.correctStreak ?? 0) + 1;
        const next: WordStats =
          streak >= clearStreak
            ? { ...prev, incorrectCount: 0, correctStreak: 0, lastUpdated: now }
            : { ...prev, correctStreak: streak, lastUpdated: now };
        void putWordStats(next);
        return { ...s, [wordId]: next };
      } else {
        if (!prev.correctStreak) return s;
        const next: WordStats = { ...prev, correctStreak: 0, lastUpdated: now };
        void putWordStats(next);
        return { ...s, [wordId]: next };
      }
    });
    schedulePush();
  }, [schedulePush]);

  // ---------- カスタムジャンル ----------
  // 単語データ + customGenres の和集合（フィルターに自動反映）
  const allGenres = useMemo<string[]>(() => {
    const fromWords = words.map((w) => w.genre).filter(Boolean);
    const fromCustom = user.customGenres ?? [];
    return Array.from(new Set([...fromCustom, ...fromWords])).sort((a, b) =>
      a.localeCompare(b, "ja")
    );
  }, [words, user.customGenres]);

  const addCustomGenre = useCallback((genre: string) => {
    const u = userRef.current;
    if ((u.customGenres ?? []).includes(genre)) return;
    persistUser({ ...u, customGenres: [...(u.customGenres ?? []), genre] });
  }, [persistUser]);

  const addCustomGenres = useCallback((genres: string[]) => {
    const u = userRef.current;
    const existing = u.customGenres ?? [];
    const newGenres = genres.filter((g) => !existing.includes(g));
    if (newGenres.length === 0) return;
    persistUser({ ...u, customGenres: [...existing, ...newGenres] });
  }, [persistUser]);

  const removeCustomGenre = useCallback(
    (genre: string, clearWords = true) => {
      const u = userRef.current;
      persistUser({ ...u, customGenres: (u.customGenres ?? []).filter((g) => g !== genre) });
      // clearWords が true の場合、そのジャンルを持つ単語のジャンルも空にする
      if (clearWords) {
        const affected = words.filter((w) => w.genre === genre);
        if (affected.length > 0) {
          const cleared = affected.map((w) => ({ ...w, genre: "" as const, lastUpdated: Date.now() }));
          setWords((ws) => {
            const map = new Map(ws.map((w) => [w.id, w]));
            for (const w of cleared) map.set(w.id, w);
            return Array.from(map.values());
          });
          void putWords(cleared);
        }
      }
    },
    [persistUser, words]
  );

  // ---------- 管理者：カスタム魚（全員共有） ----------
  // 組み込み魚（+オーバーライド） + 全員共有のカスタム魚 + （未移行の）ローカルカスタム魚を type で重複排除してマージ。
  const allFishMaster = useMemo<FishMaster[]>(() => {
    const map = new Map<string, FishMaster>();
    const overrideMap = new Map(fishOverrides.map((o) => [o.type, o]));
    // 組み込み魚にオーバーライドをマージ
    for (const f of FISH_MASTER) {
      const override = overrideMap.get(f.type);
      map.set(f.type, override ? { ...f, ...override } : f);
    }
    // 全員共有カスタム魚
    for (const f of sharedCustomFish) map.set(f.type, f);
    // ローカル未移行のカスタム魚
    for (const f of user.customFish ?? []) if (!map.has(f.type)) map.set(f.type, f);
    return Array.from(map.values());
  }, [fishOverrides, sharedCustomFish, user.customFish]);

  // ガチャ抽選（buyGachaFish）から最新の一覧を参照するためのref
  useEffect(() => {
    allFishMasterRef.current = allFishMaster;
  }, [allFishMaster]);

  // 実績チェック：stat変化を検知して新規解除を自動付与（通常＋後追いを1本に統合）。
  // grantedRewardRef で「effectが素早く2回発火しても」同期的に二重付与をロックする（B2/B6対策）。
  const grantedRewardRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // 魚データ（クラウドのカスタム魚等）が揃う前に評価すると gachaFishMasterCount が
    // 小さく、図鑑コンプリートが誤解除される。読み込み完了までゲートする（B7対策）。
    if (!ready || !fishDataReady) return;

    const stats = buildAchievementStats(
      user.tanks ?? [],
      user.lifetimeWordsAnswered ?? 0,
      user.lifetimeGoldEarned ?? 0,
      user.jobLevel,
      user.customFish?.length ?? 0,
      // 実績専用魚を分母・分子とも除外して統一（AchievementView と同じロジック。B1対策）
      encyclopedia.filter(
        (e) => allFishMaster.find((f) => f.type === e.fishType)?.rewardOnly !== true
      ).length,
      allFishMaster.filter((f) => !f.rewardOnly).length
    );
    const alreadyUnlocked = user.unlockedAchievements ?? [];
    // 新たに条件を満たした実績（ロック→解除）
    const newAchievements = checkNewAchievements(stats, alreadyUnlocked);

    const newToUnlock = newAchievements.filter((a) => !grantedRewardRef.current.has(a.id));

    if (newToUnlock.length === 0) return;

    // 同期的な二重処理ガード
    for (const a of newToUnlock) grantedRewardRef.current.add(a.id);

    // unlockedAchievements を関数型 setUser で更新（B2対策）
    setUser((prevUser) => {
      const prevUnlocked = prevUser.unlockedAchievements ?? [];
      const mergedUnlocked = [...prevUnlocked];
      for (const a of newToUnlock) if (!mergedUnlocked.includes(a.id)) mergedUnlocked.push(a.id);
      if (mergedUnlocked.length === prevUnlocked.length) return prevUser;
      const updated = {
        ...prevUser,
        unlockedAchievements: mergedUnlocked,
        lastUpdated: Date.now(),
      };
      void putUserStatus(updated);
      return updated;
    });

    // 新規解除の通知（報酬魚の有無で文言を変える）
    for (const a of newToUnlock) {
      if (allFishMaster.some((f) => f.linkedAchievementId === a.id)) {
        pushNotice("🏆", `実績解除:「${a.label}」→ 実績画面でGETしてね！`);
      } else {
        pushNotice("🏆", `実績解除:「${a.label}」（報酬のおさかなは準備中です）`);
      }
    }
  }, [
    ready,
    fishDataReady,
    user.tanks,
    user.lifetimeWordsAnswered,
    user.lifetimeGoldEarned,
    user.jobLevel,
    user.customFish,
    user.unlockedAchievements,
    sharedCustomFish,
    encyclopedia,
    allFishMaster,
    setUser,
    pushNotice,
  ]);

  const claimAchievementReward = useCallback(
    (achievementId: string) => {
      const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
      const rewardFish = allFishMasterRef.current.find((f) => f.linkedAchievementId === achievementId);
      if (!rewardFish) return;

      // 二重受け取りの防止。
      // 受取済み判定を setUser の更新関数の中だけに置くと、state 更新は非同期のため
      // GETボタンを素早く2回押したときに魚だけ2匹追加されてしまう。
      // そこで「永続化済みの受取記録」と「同じtick内の実行中フラグ」の2段構えで弾く。
      if ((userRef.current.claimedAchievementRewards ?? []).includes(achievementId)) return;
      if (claimingAchievementsRef.current.has(achievementId)) return;
      claimingAchievementsRef.current.add(achievementId);

      const name = rewardFish.displayName ?? rewardFish.type;
      const tankCount = fishRef.current.filter(
        (f) => resolveTankId(f, tanksRef.current, allFishMasterRef.current) === currentTankIdRef.current
      ).length;

      if (tankCount < userRef.current.tankCapacity) {
        addFishToTank(rewardFish, name);
      } else {
        addFishToBox(rewardFish, name);
      }

      setUser((u) => {
        const prev = u.claimedAchievementRewards ?? [];
        if (prev.includes(achievementId)) return u;
        const updated = {
          ...u,
          claimedAchievementRewards: [...prev, achievementId],
          lastUpdated: Date.now(),
        };
        void putUserStatus(updated);
        return updated;
      });

      pushNotice("🏆", `「${achievement?.label ?? ""}」の報酬 ${name} がなかまに！`);
    },
    [addFishToTank, addFishToBox, pushNotice, setUser]
  );

  const addCustomFish = useCallback(
    (def: CustomFishDef) => {
      locallyModifiedFishTypesRef.current.add(def.type);
      // 全員共有へ即時反映（楽観的更新）
      setSharedCustomFish((prev) =>
        prev.some((f) => f.type === def.type) ? prev : [...prev, def]
      );
      // ローカルにも保持（オフライン表示・後方互換）
      const u = userRef.current;
      const existing = u.customFish ?? [];
      if (!existing.some((f) => f.type === def.type)) {
        persistUser({ ...u, customFish: [...existing, def] });
      }
      // 共有テーブルへ登録（全ユーザーのガチャ・図鑑に出す）
      void postSharedCustomFish(def).catch((e) => {
        console.error("[CustomFish] post failed", e);
        pushNotice("⚠️", "共有おさかなの登録に失敗しました（通信状況をご確認ください）");
      });
    },
    [persistUser, pushNotice]
  );

  const updateCustomFish = useCallback(
    (def: CustomFishDef) => {
      locallyModifiedFishTypesRef.current.add(def.type);
      // 全員共有を更新
      setSharedCustomFish((prev) =>
        prev.map((f) => (f.type === def.type ? def : f))
      );
      // ローカルも更新
      const u = userRef.current;
      persistUser({ ...u, customFish: (u.customFish ?? []).map((f) => (f.type === def.type ? def : f)) });
      // クラウド更新: POST は fishType(=type) 主キーの MERGE（upsert）なので直接呼べば良い。
      // 以前は「削除してから再登録」の2リクエスト構成だったため、削除成功後に
      // 再登録がタイムアウト/失敗すると共有プールから魚が消えたまま戻らないバグがあった。
      void postSharedCustomFish(def).catch((e) => {
        console.error("[CustomFish] update failed", e);
        pushNotice("⚠️", "共有おさかなの更新に失敗しました（通信状況をご確認ください）");
      });
    },
    [persistUser, pushNotice]
  );

  const removeCustomFish = useCallback(
    (fishType: string) => {
      locallyModifiedFishTypesRef.current.add(fishType);
      // 全員共有から削除
      setSharedCustomFish((prev) => prev.filter((f) => f.type !== fishType));
      const u = userRef.current;
      persistUser({ ...u, customFish: (u.customFish ?? []).filter((f) => f.type !== fishType) });
      // 水槽内にいる同 type の魚も削除
      const toRemove = fishRef.current.filter((f) => f.type === fishType);
      for (const f of toRemove) void dbDeleteFish(f.fishId);
      if (toRemove.length > 0) setFishList((list) => list.filter((f) => f.type !== fishType));
      // 共有テーブルからも削除（全ユーザーから消える）
      void deleteSharedCustomFish(fishType).catch((e) =>
        console.error("[CustomFish] delete failed", e)
      );
    },
    [persistUser]
  );

  // 組み込み魚のオーバーライド（編集用）
  const updateBuiltinFish = useCallback(
    (override: FishOverride) => {
      setFishOverrides((prev) =>
        prev.some((f) => f.type === override.type)
          ? prev.map((f) => (f.type === override.type ? override : f))
          : [...prev, override]
      );
      const overrideWithTs = { ...override, lastUpdated: Date.now() };
      void putFishOverride(overrideWithTs).catch((e) => {
        console.error("[FishOverride] local update failed", e);
        pushNotice("⚠️", "組み込みおさかなの編集に失敗しました");
      });
      void postSharedFishOverride(overrideWithTs).catch((e) => {
        console.error("[FishOverride] cloud update failed", e);
      });
      // 既存の水槽魚にも全フィールドを反映
      const currentFish = fishRef.current;
      const affected = currentFish.filter((f) => f.type === override.type);
      if (affected.length > 0) {
        const updated = currentFish.map((f) => {
          if (f.type !== override.type) return f;
          return {
            ...f,
            ...(override.rarity !== undefined && { rarity: override.rarity }),
          };
        });
        persistFishList(updated);
      }
    },
    [pushNotice, persistFishList]
  );

  // 組み込み魚のオーバーライドを削除（デフォルト外観にリセット）
  const removeBuiltinFishOverride = useCallback(
    (fishType: string) => {
      setFishOverrides((prev) => prev.filter((o) => o.type !== fishType));
      void deleteFishOverride(fishType);
      void deleteSharedFishOverride(fishType).catch((e) => {
        console.error("[FishOverride] cloud delete failed", e);
        pushNotice("⚠️", "おさかな編集のリセットに失敗しました（通信エラー）");
      });
      pushNotice("🔄", `${fishType}の編集をリセットしました`);
    },
    [pushNotice]
  );

  // fishOverrides を DB から読み込み、クラウドの最新データとマージ
  useEffect(() => {
    void getAllFishOverrides()
      .then((local) => setFishOverrides(local))
      .catch((e) => console.error("[FishOverrides] local load failed", e))
      .finally(() => markFishDataSourceSettled("localOverrides"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.user?.email) return;
    if (!shouldRefreshCloudFish("fishOverrides")) return; // 24時間以内に取得済みならスキップ（無料枠節約）
    let cancelled = false;
    (async () => {
      try {
        const shared = await fetchSharedFishOverrides();
        if (cancelled) return;
        markCloudFishRefreshed("fishOverrides");
        setFishOverrides((local) => {
          const merged = [...local];
          for (const remote of shared) {
            const idx = merged.findIndex((o) => o.type === remote.type);
            const localUpdated = idx >= 0 ? (merged[idx].lastUpdated ?? 0) : 0;
            const remoteUpdated = remote.lastUpdated ?? 0;
            if (idx < 0) {
              merged.push(remote);
            } else if (remoteUpdated > localUpdated) {
              merged[idx] = remote;
            }
          }
          void putFishOverridesBulk(merged); // 次回起動用にローカルへキャッシュ
          return merged;
        });
      } catch (e) {
        console.error("[FishOverrides] cloud load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.email, sharedFishTick]);

  // 穴抜け問題を DB から読み込み
  useEffect(() => {
    void getAllBlankQuestions().then(setBlankQuestions);
    void getAllBlankQuestionStats().then((list) =>
      setBlankQuestionStats(Object.fromEntries(list.map((s) => [s.id, s])))
    );
  }, []);

  const buyTank = useCallback(
    (type: WaterType): boolean => {
      // setUser の関数型更新を使い、userRef 経由の古いスナップショット参照によるレース
      // （連打時に古い水槽数・所持金で判定して静かに失敗する）を避ける。
      let success = false;
      let stampedResult: UserStatus | null = null;
      setUser((u) => {
        const currentTanks = u.tanks ?? (() => {
          const swCount = u.saltwaterTankCount ?? 1;
          const fwCount = u.freshwaterTankCount ?? (u.hasFreshwaterTank ? 1 : 0);
          const r: Tank[] = [];
          for (let i = 1; i <= swCount; i++) r.push({ id: `sw-${i}`, type: "saltwater", name: `海水 ${i}` });
          for (let i = 1; i <= fwCount; i++) r.push({ id: `fw-${i}`, type: "freshwater", name: `淡水 ${i}` });
          return r;
        })();
        const sameTanks = currentTanks.filter(t => t.type === type);
        if (currentTanks.length >= MAX_TOTAL_TANKS) return u; // 合計上限 10 槽（内訳は自由）
        const price = SHOP_PRICES.freshwaterTank; // 海水・淡水共通 3000G
        if (u.gold < price) return u;
        const idx = sameTanks.length + 1;
        const prefix = type === "saltwater" ? "sw" : "fw";
        const tankName = type === "saltwater" ? `海水 ${idx}` : `淡水 ${idx}`;
        const newTank: Tank = { id: `${prefix}-${idx}`, type, name: tankName };
        const stamped = { ...u, gold: u.gold - price, tanks: [...currentTanks, newTank], lastUpdated: Date.now() };
        success = true;
        stampedResult = stamped;
        return stamped;
      });
      if (success && stampedResult) {
        const finalUser: UserStatus = stampedResult;
        void putUserStatus(finalUser);
        const addedTank = finalUser.tanks![finalUser.tanks!.length - 1];
        recordLedger(-SHOP_PRICES.freshwaterTank, `${addedTank.name}水槽追加`, finalUser.gold);
        schedulePush();
      }
      return success;
    },
    [recordLedger, schedulePush]
  );

  const renameTank = useCallback(
    (tankId: string, newName: string) => {
      const u = userRef.current;
      const currentTanks = u.tanks ?? [];
      const updated = currentTanks.map(t => t.id === tankId ? { ...t, name: newName } : t);
      persistUser({ ...u, tanks: updated });
    },
    [persistUser]
  );

  const setBackgroundImage = useCallback(
    (tankId: string, base64: string) => {
      const u = userRef.current;
      const currentTanks = u.tanks ?? [];
      const updated = currentTanks.map(t =>
        t.id === tankId ? { ...t, backgroundImageBase64: base64 } : t
      );
      persistUser({ ...u, tanks: updated });
    },
    [persistUser]
  );

  const moveFishToTank = useCallback(
    (fishId: string, targetTankId: string) => {
      const fish = fishRef.current.find(f => f.fishId === fishId);
      if (!fish) return;
      // 対象タンク・魚の水の種類を確認し、海水魚は海水水槽・淡水魚は淡水水槽にのみ移動できる
      const targetTank = tanksRef.current.find(t => t.id === targetTankId);
      if (!targetTank) return;
      const fishMaster = allFishMasterRef.current.find(m => m.type === fish.type);
      const fishWaterType = fishMaster?.waterType ?? "saltwater";
      if (fishWaterType !== targetTank.type) {
        pushNotice("💧", `${fishWaterType === "saltwater" ? "海水" : "淡水"}魚は${targetTank.type === "saltwater" ? "海水" : "淡水"}水槽に入りません`);
        return;
      }
      const updated: Fish = { ...fish, tankId: targetTankId, lastUpdated: Date.now() };
      setFishList(list => list.map(f => f.fishId === fishId ? updated : f));
      void putFish(updated);
      schedulePush();
    },
    [schedulePush, pushNotice]
  );

  const releaseBoxFish = useCallback(
    (fishId: string) => {
      const u = userRef.current;
      const fish = (u.boxFish ?? []).find((f) => f.fishId === fishId);
      if (!fish) return;
      const now = Date.now();
      persistUser({ ...u, boxFish: (u.boxFish ?? []).filter((f) => f.fishId !== fishId) });
      const entry: FishHistoryEntry = {
        entryId: crypto.randomUUID(),
        fishId: fish.fishId,
        fishType: fish.type,
        name: fish.name,
        reason: "released" as FishLeaveReason,
        date: todayString(),
        timestamp: now,
        lastUpdated: now,
      };
      setFishHistory((h) => [...h, entry]);
      void putFishHistoryEntry(entry);
      pushNotice("🌊", `${fish.name} を海へ帰した`);
    },
    [persistUser, pushNotice]
  );

  // ---------- 穴抜け問題 ----------
  const addBlankQuestion = useCallback(
    (q: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">) => {
      const now = Date.now();
      const newQ: BlankQuestion = { ...q, id: crypto.randomUUID(), createdAt: now, lastUpdated: now };
      setBlankQuestions((prev) => [...prev, newQ]);
      void putBlankQuestion(newQ);
    },
    []
  );

  const importBlankQuestions = useCallback(
    (qs: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">[]) => {
      const now = Date.now();
      const newQs: BlankQuestion[] = qs.map((q) => ({ ...q, id: crypto.randomUUID(), createdAt: now, lastUpdated: now }));
      setBlankQuestions((prev) => [...prev, ...newQs]);
      void putBlankQuestions(newQs);
    },
    []
  );

  const updateBlankQuestion = useCallback(
    (q: BlankQuestion) => {
      const updated: BlankQuestion = { ...q, lastUpdated: Date.now() };
      setBlankQuestions((prev) => prev.map((x) => (x.id === q.id ? updated : x)));
      void putBlankQuestion(updated);
    },
    []
  );

  // CSV往復取り込み用：id一致は更新、無ければ追加を一括処理（統計はid据え置きで維持）
  const upsertBlankQuestions = useCallback(
    (rows: BlankQuestion[]) => {
      if (rows.length === 0) return;
      setBlankQuestions((prev) => {
        const map = new Map(prev.map((q) => [q.id, q]));
        for (const r of rows) map.set(r.id, r);
        return Array.from(map.values());
      });
      void putBlankQuestions(rows);
    },
    []
  );

  const removeBlankQuestion = useCallback(
    (id: string) => {
      setBlankQuestions((prev) => prev.filter((q) => q.id !== id));
      setBlankQuestionStats((prev) => { const next = { ...prev }; delete next[id]; return next; });
      void deleteBlankQuestion(id);
    },
    []
  );

  // CSV再取込で「絞込書出CSVに無い＝削除された」問題をまとめて消すために使う
  const removeBlankQuestions = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setBlankQuestions((prev) => prev.filter((q) => !idSet.has(q.id)));
      setBlankQuestionStats((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      void deleteBlankQuestions(ids);
    },
    []
  );

  const recordBlankAnswer = useCallback(
    (id: string, correct: boolean) => {
      setBlankQuestionStats((prev) => {
        const existing = prev[id];
        const now = Date.now();
        const updated: BlankQuestionStats = {
          id,
          incorrectCount: correct ? (existing?.incorrectCount ?? 0) : (existing?.incorrectCount ?? 0) + 1,
          lastReviewedAt: now,
          lastUpdated: now,
        };
        void putBlankQuestionStats(updated);
        return { ...prev, [id]: updated };
      });
    },
    []
  );

  // 単語の registerWordFirstTryOutcome と同じ役割・同じ設定（weakClearStreak）を使う
  const registerBlankFirstTryOutcome = useCallback((id: string, correct: boolean) => {
    const clearStreak = userRef.current.weakClearStreak ?? DEFAULT_WEAK_CLEAR_STREAK;
    setBlankQuestionStats((prev) => {
      const existing = prev[id];
      if (!existing || existing.incorrectCount === 0) return prev;
      const now = Date.now();
      if (correct) {
        const streak = (existing.correctStreak ?? 0) + 1;
        const next: BlankQuestionStats =
          streak >= clearStreak
            ? { ...existing, incorrectCount: 0, correctStreak: 0, lastUpdated: now }
            : { ...existing, correctStreak: streak, lastUpdated: now };
        void putBlankQuestionStats(next);
        return { ...prev, [id]: next };
      } else {
        if (!existing.correctStreak) return prev;
        const next: BlankQuestionStats = { ...existing, correctStreak: 0, lastUpdated: now };
        void putBlankQuestionStats(next);
        return { ...prev, [id]: next };
      }
    });
  }, []);

  // ---------- その他 ----------
  const resetAllData = useCallback(async () => {
    await clearAllData();
    const fresh = createInitialUserStatus();
    setUser(fresh);
    setFishList([]);
    setWords([]);
    setWordStats({});
    setEncyclopedia([]);
    setStudySessions([]);
    setGoldLedger([]);
    setBlankQuestions([]);
    setBlankQuestionStats({});
  }, []);

  // ☁️ 同期ボタン: クラウド→ローカル（pull のみ）
  const syncNow = useCallback(async () => {
    const email = session?.user?.email;
    if (!email) { pushNotice("⚠️", "ログインしていないため同期できません"); return; }
    try {
      const restored = await pullFromCloud(email);
      if (!restored) {
        pushNotice("⚠️", "クラウドにデータがありません（先にセーブしてください）");
        return;
      }
      // pull 後に全 state を IndexedDB から再読み込み
      const [updatedFish, updatedUser, updatedWords, updatedStats, updatedEncy, updatedHistory, updatedSessions, updatedLedger, updatedBlanks, updatedBlankStats] = await Promise.all([
        getAllFish(), getUserStatus(), getAllWords(), getAllWordStats(), getAllEncyclopedia(), getAllFishHistory(), getAllStudySessions(), getAllGoldLedger(), getAllBlankQuestions(), getAllBlankQuestionStats()
      ]);
      // クラウドの古い userStatus を取り込んだ直後に容量が巻き戻っていないか、
      // 通帳（削除されないログ）を基準にその場で復旧する（初期ロード時と同じロジック）。
      let finalUser = updatedUser;
      if (updatedUser) {
        const recovery = recoverExpansionCapacity(updatedUser, updatedLedger);
        if (recovery.changed) {
          finalUser = recovery.user;
          void putUserStatus(finalUser);
        }
      }
      setFishList(updatedFish);
      if (finalUser) setUser(finalUser);
      setWords(updatedWords);
      setWordStats(Object.fromEntries(updatedStats.map((s) => [s.wordId, s])));
      setEncyclopedia(updatedEncy);
      setFishHistory(updatedHistory.sort((a, b) => a.timestamp - b.timestamp));
      setStudySessions(updatedSessions.sort((a, b) => a.timestamp - b.timestamp));
      setGoldLedger(updatedLedger.sort((a, b) => a.timestamp - b.timestamp));
      setBlankQuestions(updatedBlanks);
      setBlankQuestionStats(Object.fromEntries(updatedBlankStats.map((s) => [s.id, s])));
      // 共有魚（他の人の追加・編集）もこの機会に取り直す。
      // pull で既にDBが起きているので、ここでの追加コストはほぼ無い。
      requestCloudFishRefresh();
      setSharedFishTick((t) => t + 1);
      pushNotice("☁️", "クラウドから復元しました");
    } catch (err) {
      console.error("[Sync] pull failed:", err);
      const msg = err instanceof Error ? err.message : "";
      const friendly = friendlySyncErrorMessage(msg);
      pushNotice("⚠️", friendly ?? `同期に失敗しました${msg ? `（${msg}）` : ""}`);
    }
  }, [session?.user?.email, pushNotice]);

  // 💾 セーブボタン: ローカル→クラウド（push のみ）。JSON ダウンロードは Modals 側で行う
  const pushNow = useCallback(async () => {
    const email = session?.user?.email;
    if (!email) throw new Error("not-logged-in");
    const { userStatusStale } = await pushToCloud(email);
    if (userStatusStale) throw new Error("cloud-status-stale");
  }, [session?.user?.email]);

  return (
    <GameContext.Provider
      value={{
        ready,
        fishDataReady,
        user,
        fishList,
        words,
        wordStats,
        encyclopedia,
        fishHistory,
        studySessions,
        goldLedger,
        notices,
        dismissNotice,
        pushNotice,
        updateUser,
        completeStudy,
        completeFreeWork,
        patchStudySession,
        addManualSession,
        feedAllFish,
        useMedicine,
        moveTankFishToBox,
        renameFish,
        removeFish,
        buyGachaFish,
        addFishToTank,
        addFishToBox,
        moveBoxFishToTank,
        releaseBoxFish,
        buyItem,
        saveWord,
        saveWords,
        removeWord,
        removeWords,
        recordAnswer,
        registerWordFirstTryOutcome,
        allGenres,
        addCustomGenre,
        addCustomGenres,
        removeCustomGenre,
        allFishMaster,
        addCustomFish,
        updateCustomFish,
        removeCustomFish,
        updateBuiltinFish,
        removeBuiltinFishOverride,
        tanks,
        currentTankId,
        setCurrentTankId,
        moveFishToTank,
        buyTank,
        renameTank,
        setBackgroundImage,
        blankQuestions,
        blankQuestionStats,
        addBlankQuestion,
        importBlankQuestions,
        updateBlankQuestion,
        upsertBlankQuestions,
        removeBlankQuestion,
        removeBlankQuestions,
        recordBlankAnswer,
        registerBlankFirstTryOutcome,
        claimAchievementReward,
        resetAllData,
        syncNow,
        pushNow,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
