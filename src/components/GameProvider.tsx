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
  ADULT_LEVEL,
  AFFECTION_GAIN_RATE,
  BAIT_EFFECT,
  BOX_CAPACITY_INITIAL,
  boxExpansionPrice,
  calculateOfflineEffects,
  type GachaTier,
  GACHA_TIERS,
  jobLevelFor,
  MAX_AFFECTION,
  MAX_FISH_LEVEL,
  MAX_TANK_CAPACITY,
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
  deleteWord as dbDeleteWord,
  discoverFishType,
  getAllBlankQuestions,
  getAllBlankQuestionStats,
  getAllEncyclopedia,
  getAllFish,
  getAllFishHistory,
  getAllFishOverrides,
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
  putFishOverride,
  putGoldLedgerEntry,
  putStudySession,
  putUserStatus,
  putWord,
  putWords,
  putWordStats,
} from "@/lib/db";
import { sfx } from "@/lib/sound";
import { pullFromCloud, pushToCloud } from "@/lib/sync";
import { deleteSharedCustomFish, fetchSharedCustomFish, postSharedCustomFish } from "@/lib/customFish";
import { fetchSharedFishOverrides, postSharedFishOverride } from "@/lib/fishOverrides";
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
  buyTank: (type: WaterType) => void;
  feedAllFish: (kind: BaitKind) => boolean;
  useMedicine: (fishId: string) => boolean;
  moveTankFishToBox: (fishId: string) => void;
  renameFish: (fishId: string, name: string) => void;
  removeFish: (fishId: string) => void;
  buyGachaFish: (tier: GachaTier) => FishMaster | null;
  addFishToTank: (master: FishMaster, name: string) => void;
  addFishToBox: (master: FishMaster, name: string) => void;
  moveBoxFishToTank: (fishId: string) => boolean;
  releaseBoxFish: (fishId: string) => void;

  // ショップ
  buyItem: (item: keyof typeof SHOP_PRICES) => boolean;

  // 単語
  saveWord: (word: Word) => void;
  saveWords: (words: Word[]) => void;
  removeWord: (id: string) => void;
  recordAnswer: (wordId: string, correct: boolean) => void;
  resetWordWeak: (wordId: string) => void;
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
  buyTankSlot: (type: import("@/lib/types").WaterType) => void;

  // 穴抜け問題
  blankQuestions: BlankQuestion[];
  blankQuestionStats: Record<string, BlankQuestionStats>;
  addBlankQuestion: (q: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">) => void;
  importBlankQuestions: (qs: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">[]) => void;
  removeBlankQuestion: (id: string) => void;
  recordBlankAnswer: (id: string, correct: boolean) => void;

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

export function GameProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [ready, setReady] = useState(false);
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

  const tanks = useMemo<Tank[]>(() => {
    if (user.tanks?.length) return user.tanks;
    const swCount = user.saltwaterTankCount ?? 1;
    const fwCount = user.freshwaterTankCount ?? (user.hasFreshwaterTank ? 1 : 0);
    const result: Tank[] = [];
    for (let i = 1; i <= swCount; i++) result.push({ id: `sw-${i}`, type: "saltwater", name: `海水 ${i}` });
    for (let i = 1; i <= fwCount; i++) result.push({ id: `fw-${i}`, type: "freshwater", name: `淡水 ${i}` });
    return result;
  }, [user.tanks, user.saltwaterTankCount, user.freshwaterTankCount, user.hasFreshwaterTank]);

  const pushNotice = useCallback((icon: string, text: string) => {
    const id = noticeSeq++;
    setNotices((n) => [...n, { id, icon, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((n) => n.filter((x) => x.id !== id));
  }, []);

  // 自動同期は無効。手動同期のみ（syncNow ボタンで実行）
  // eslint-disable-next-line @typescript-eslint/no-empty-function
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
      if (u) {
        applyOfflineEffects(loadedUser, fish, now);
      } else {
        setUser(loadedUser);
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

  // ---------- 全員共有のカスタム魚を取得 ----------
  // ログイン中に共有テーブルから取得して全ユーザーのガチャ・図鑑に反映する。
  // さらに、この端末にローカルだけで持っていたカスタム魚を共有へ移行する
  // （以前は個人持ちだったものを全員共有にするため）。
  useEffect(() => {
    if (!session?.user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const shared = await fetchSharedCustomFish();
        if (cancelled) return;
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
        // 共有 + 移行分をマージして state に反映
        const merged = [...shared];
        const mergedTypes = new Set(merged.map((f) => f.type));
        for (const f of localOnly) {
          if (!mergedTypes.has(f.type)) {
            merged.push(f);
            mergedTypes.add(f.type);
          }
        }
        setSharedCustomFish(merged);
      } catch (e) {
        console.error("[CustomFish] load failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

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
      persistUser({ ...u, gold: u.gold + amount });
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
      const next = fishRef.current.map((f) => {
        const level = Math.min(MAX_FISH_LEVEL, f.level + 1);
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
      return true;
    },
    [persistUser, persistFishList, pushNotice]
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
        tankId: currentTankIdRef.current,
      };
      const next = [...fishRef.current, fish];
      setFishList(next);
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
      const u = userRef.current;
      persistUser({ ...u, boxFish: [...(u.boxFish ?? []), fish] });
      void discoverFishType(master.type);
      setEncyclopedia((enc) =>
        enc.some((e) => e.fishType === master.type)
          ? enc
          : [...enc, { fishType: master.type, discoveredAt: now, lastUpdated: now }]
      );
      pushNotice("📦", `${name} はボックスに入った！水槽に空きができたら移せるよ`);
    },
    [persistUser, pushNotice]
  );

  const moveBoxFishToTank = useCallback(
    (fishId: string): boolean => {
      const u = userRef.current;
      if (fishRef.current.length >= u.tankCapacity) return false;
      const boxFish = (u.boxFish ?? []).find((f) => f.fishId === fishId);
      if (!boxFish) return false;
      const newBoxFish = (u.boxFish ?? []).filter((f) => f.fishId !== fishId);
      persistUser({ ...u, boxFish: newBoxFish });
      const next = [...fishRef.current, boxFish];
      setFishList(next);
      void putFish(boxFish);
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
    // 共有カスタム魚を含む最新の一覧から抽選する
    return rollGachaWithWeights(info.weights, allFishMasterRef.current);
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
  const saveWord = useCallback((word: Word) => {
    setWords((ws) => {
      const i = ws.findIndex((w) => w.id === word.id);
      if (i >= 0) {
        const next = [...ws];
        next[i] = word;
        return next;
      }
      return [...ws, word];
    });
    void putWord(word);
    schedulePush();
  }, [schedulePush]);

  const saveWords = useCallback((newWords: Word[]) => {
    setWords((ws) => {
      const map = new Map(ws.map((w) => [w.id, w]));
      for (const w of newWords) map.set(w.id, w);
      return Array.from(map.values());
    });
    void putWords(newWords);
    schedulePush();
  }, [schedulePush]);

  const removeWord = useCallback((id: string) => {
    setWords((ws) => ws.filter((w) => w.id !== id));
    setWordStats((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    void dbDeleteWord(id);
    const u = userRef.current;
    persistUser({ ...u, deletedWordIds: [...(u.deletedWordIds ?? []), id] });
  }, [persistUser]);

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

  const resetWordWeak = useCallback((wordId: string) => {
    setWordStats((s) => {
      const prev = s[wordId];
      if (!prev || prev.incorrectCount === 0) return s;
      const next: WordStats = { ...prev, incorrectCount: 0, lastUpdated: Date.now() };
      void putWordStats(next);
      return { ...s, [wordId]: next };
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

  const addCustomFish = useCallback(
    (def: CustomFishDef) => {
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
      // 全員共有を更新
      setSharedCustomFish((prev) =>
        prev.map((f) => (f.type === def.type ? def : f))
      );
      // ローカルも更新
      const u = userRef.current;
      persistUser({ ...u, customFish: (u.customFish ?? []).map((f) => (f.type === def.type ? def : f)) });
      // クラウド更新（一度削除してから再登録）
      void deleteSharedCustomFish(def.type)
        .then(() => postSharedCustomFish(def))
        .catch((e) => {
          console.error("[CustomFish] update failed", e);
          pushNotice("⚠️", "共有おさかなの更新に失敗しました（通信状況をご確認ください）");
        });
    },
    [persistUser, pushNotice]
  );

  const removeCustomFish = useCallback(
    (fishType: string) => {
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

  // fishOverrides を DB から読み込み、クラウドの最新データとマージ
  useEffect(() => {
    void getAllFishOverrides().then(setFishOverrides);
  }, []);

  useEffect(() => {
    if (!session?.user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const shared = await fetchSharedFishOverrides();
        if (cancelled) return;
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
          return merged;
        });
      } catch (e) {
        console.error("[FishOverrides] cloud load failed", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // 穴抜け問題を DB から読み込み
  useEffect(() => {
    void getAllBlankQuestions().then(setBlankQuestions);
    void getAllBlankQuestionStats().then((list) =>
      setBlankQuestionStats(Object.fromEntries(list.map((s) => [s.id, s])))
    );
  }, []);

  const buyTank = useCallback(
    (type: WaterType) => {
      const u = userRef.current;
      const currentTanks = u.tanks ?? (() => {
        const swCount = u.saltwaterTankCount ?? 1;
        const fwCount = u.freshwaterTankCount ?? (u.hasFreshwaterTank ? 1 : 0);
        const r: Tank[] = [];
        for (let i = 1; i <= swCount; i++) r.push({ id: `sw-${i}`, type: "saltwater", name: `海水 ${i}` });
        for (let i = 1; i <= fwCount; i++) r.push({ id: `fw-${i}`, type: "freshwater", name: `淡水 ${i}` });
        return r;
      })();
      const sameTanks = currentTanks.filter(t => t.type === type);
      if (sameTanks.length >= 3) return; // 上限 3 槽
      const price = SHOP_PRICES.freshwaterTank; // 海水・淡水共通 3000G
      if (u.gold < price) return;
      const idx = sameTanks.length + 1;
      const prefix = type === "saltwater" ? "sw" : "fw";
      const tankName = type === "saltwater" ? `海水 ${idx}` : `淡水 ${idx}`;
      const newTank: Tank = { id: `${prefix}-${idx}`, type, name: tankName };
      persistUser({ ...u, gold: u.gold - price, tanks: [...currentTanks, newTank] });
      recordLedger(-price, `${tankName}水槽追加`, u.gold - price);
    },
    [persistUser, recordLedger]
  );

  const moveFishToTank = useCallback(
    (fishId: string, targetTankId: string) => {
      const fish = fishRef.current.find(f => f.fishId === fishId);
      if (!fish) return;
      const updated: Fish = { ...fish, tankId: targetTankId, lastUpdated: Date.now() };
      setFishList(list => list.map(f => f.fishId === fishId ? updated : f));
      void putFish(updated);
      schedulePush();
    },
    [schedulePush]
  );

  // 旧 buyTankSlot — 互換のためにエイリアスを残す（ShopView 移行後は削除可）
  const buyTankSlot = useCallback(
    (type: WaterType) => {
      const u = userRef.current;
      const price = SHOP_PRICES.freshwaterTank;
      if (u.gold < price) return;
      if (type === "saltwater") {
        persistUser({ ...u, gold: u.gold - price, saltwaterTankCount: (u.saltwaterTankCount ?? 1) + 1 });
      } else {
        persistUser({ ...u, gold: u.gold - price, freshwaterTankCount: (u.freshwaterTankCount ?? 0) + 1 });
      }
      recordLedger(-price, `${type === "saltwater" ? "海水" : "淡水"}水槽追加`, u.gold - price);
    },
    [persistUser, recordLedger]
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

  const removeBlankQuestion = useCallback(
    (id: string) => {
      setBlankQuestions((prev) => prev.filter((q) => q.id !== id));
      setBlankQuestionStats((prev) => { const next = { ...prev }; delete next[id]; return next; });
      void deleteBlankQuestion(id);
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
      const [updatedFish, updatedUser, updatedWords, updatedStats, updatedEncy, updatedHistory, updatedSessions, updatedLedger] = await Promise.all([
        getAllFish(), getUserStatus(), getAllWords(), getAllWordStats(), getAllEncyclopedia(), getAllFishHistory(), getAllStudySessions(), getAllGoldLedger()
      ]);
      setFishList(updatedFish);
      if (updatedUser) setUser(updatedUser);
      setWords(updatedWords);
      setWordStats(Object.fromEntries(updatedStats.map((s) => [s.wordId, s])));
      setEncyclopedia(updatedEncy);
      setFishHistory(updatedHistory.sort((a, b) => a.timestamp - b.timestamp));
      setStudySessions(updatedSessions.sort((a, b) => a.timestamp - b.timestamp));
      setGoldLedger(updatedLedger.sort((a, b) => a.timestamp - b.timestamp));
      pushNotice("☁️", "クラウドから復元しました");
    } catch (err) {
      console.error("[Sync] pull failed:", err);
      const msg = err instanceof Error ? err.message : "";
      pushNotice("⚠️", `同期に失敗しました${msg ? `（${msg}）` : ""}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email, pushNotice]);

  // 💾 セーブボタン: ローカル→クラウド（push のみ）。JSON ダウンロードは Modals 側で行う
  const pushNow = useCallback(async () => {
    const email = session?.user?.email;
    if (!email) throw new Error("not-logged-in");
    await pushToCloud(email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  return (
    <GameContext.Provider
      value={{
        ready,
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
        recordAnswer,
        resetWordWeak,
        allGenres,
        addCustomGenre,
        addCustomGenres,
        removeCustomGenre,
        allFishMaster,
        addCustomFish,
        updateCustomFish,
        removeCustomFish,
        updateBuiltinFish,
        buyTankSlot,
        tanks,
        currentTankId,
        setCurrentTankId,
        moveFishToTank,
        buyTank,
        blankQuestions,
        blankQuestionStats,
        addBlankQuestion,
        importBlankQuestions,
        removeBlankQuestion,
        recordBlankAnswer,
        resetAllData,
        syncNow,
        pushNow,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
