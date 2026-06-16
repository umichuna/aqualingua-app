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
import { FISH_MASTER, getFishMaster, rollGachaWithWeights, type FishMaster } from "@/data/fishMaster";
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
  deleteCompanion as dbDeleteCompanion,
  deleteFish as dbDeleteFish,
  deleteWord as dbDeleteWord,
  discoverFishType,
  getAllCompanions,
  getAllEncyclopedia,
  getAllFish,
  getAllFishHistory,
  getAllGoldLedger,
  getAllStudySessions,
  getAllWordStats,
  getAllWords,
  getUserStatus,
  putCompanion,
  putFish,
  putFishHistoryEntry,
  putFishList,
  putGoldLedgerEntry,
  putStudySession,
  putUserStatus,
  putWord,
  putWords,
  putWordStats,
} from "@/lib/db";
import { sfx } from "@/lib/sound";
import type {
  CustomFishDef,
  EncyclopediaEntry,
  Fish,
  FishHistoryEntry,
  FishLeaveReason,
  GoldLedgerEntry,
  StudyMode,
  StudySession,
  UserStatus,
  Word,
  WordStats,
} from "@/lib/types";

// しごとモードの表示名（通帳・記録の表示に使用）
export const MODE_LABEL: Record<StudyMode, string> = {
  self: "自己採点",
  choice: "選択肢クイズ",
  listen: "聞き流し",
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
  companionList: Fish[];
  feedAllFish: (kind: BaitKind) => boolean;
  useMedicine: (fishId: string) => boolean;
  makeCompanion: (fishId: string) => void;
  recallCompanion: (fishId: string) => boolean;
  renameFish: (fishId: string, name: string) => void;
  removeFish: (fishId: string) => void;
  buyGachaFish: (tier: GachaTier) => FishMaster | null;
  addFishToTank: (master: FishMaster, name: string) => void;
  addFishToBox: (master: FishMaster, name: string) => void;
  moveBoxFishToTank: (fishId: string) => boolean;

  // ショップ
  buyItem: (item: keyof typeof SHOP_PRICES) => boolean;

  // 単語
  saveWord: (word: Word) => void;
  saveWords: (words: Word[]) => void;
  removeWord: (id: string) => void;
  recordAnswer: (wordId: string, correct: boolean) => void;
  allGenres: string[]; // 単語データ + customGenres から自動生成
  addCustomGenre: (genre: string) => void;
  addCustomGenres: (genres: string[]) => void;
  removeCustomGenre: (genre: string) => void;

  // 管理者
  allFishMaster: FishMaster[];
  addCustomFish: (def: CustomFishDef) => void;
  removeCustomFish: (fishType: string) => void;

  // その他
  resetAllData: () => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

// 相棒リストからアクティブなバフ値を集約する
function getCompanionBuffs(companions: Fish[]) {
  let disease_resistance = 0;
  let affection_boost = 0;
  let decay_reduction = 0;
  let tank_expansion = 0;
  for (const companion of companions) {
    const master = getFishMaster(companion.type);
    if (!master?.companionBuff) continue;
    const { type, value } = master.companionBuff;
    switch (type) {
      case "disease_resistance":
        disease_resistance = Math.max(disease_resistance, value);
        break;
      case "affection_boost":
        affection_boost += value;
        break;
      case "decay_reduction":
        decay_reduction = Math.max(decay_reduction, value);
        break;
      case "tank_expansion":
        tank_expansion += value;
        break;
    }
  }
  return { disease_resistance, affection_boost, decay_reduction, tank_expansion };
}

let noticeSeq = 1;

export function GameProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserStatus>(createInitialUserStatus);
  const [fishList, setFishList] = useState<Fish[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [wordStats, setWordStats] = useState<Record<string, WordStats>>({});
  const [encyclopedia, setEncyclopedia] = useState<EncyclopediaEntry[]>([]);
  const [fishHistory, setFishHistory] = useState<FishHistoryEntry[]>([]);
  const [companionList, setCompanionList] = useState<Fish[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [goldLedger, setGoldLedger] = useState<GoldLedgerEntry[]>([]);
  const [notices, setNotices] = useState<GameNotice[]>([]);
  const userRef = useRef(user);
  const fishRef = useRef(fishList);
  const companionRef = useRef(companionList);
  useEffect(() => {
    userRef.current = user;
    fishRef.current = fishList;
    companionRef.current = companionList;
  }, [user, fishList, companionList]);

  const pushNotice = useCallback((icon: string, text: string) => {
    const id = noticeSeq++;
    setNotices((n) => [...n, { id, icon, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((n) => n.filter((x) => x.id !== id));
  }, []);

  // ---------- 永続化ヘルパー ----------
  const persistUser = useCallback((next: UserStatus) => {
    setUser(next);
    void putUserStatus(next);
  }, []);

  const persistFishList = useCallback((next: Fish[]) => {
    setFishList(next);
    void putFishList(next);
  }, []);

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
    },
    []
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
      return session.sessionId;
    },
    []
  );

  // ---------- 放置ペナルティの適用 ----------
  const applyOfflineEffects = useCallback(
    (currentUser: UserStatus, currentFish: Fish[], now: number) => {
      const updated = calculateOfflineEffects(
        currentFish,
        currentUser.lastActiveTime,
        now,
        getCompanionBuffs(companionRef.current)
      );
      const runaways = updated.filter((f) => f.status === "running_away");
      const stayed = updated.filter((f) => f.status !== "running_away");

      if (runaways.length > 0) sfx.sad();
      for (const f of runaways) {
        pushNotice("🌊", `${f.name} は海へ帰ってしまった…`);
        void dbDeleteFish(f.fishId);
        const entry: FishHistoryEntry = {
          entryId: crypto.randomUUID(),
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
      persistUser({ ...currentUser, lastActiveTime: now });
    },
    [persistFishList, persistUser, pushNotice]
  );

  // ---------- 初期ロード ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [u, fish, ws, stats, enc, history, sessions, ledger, companions] = await Promise.all([
        getUserStatus(),
        getAllFish(),
        getAllWords(),
        getAllWordStats(),
        getAllEncyclopedia(),
        getAllFishHistory(),
        getAllStudySessions(),
        getAllGoldLedger(),
        getAllCompanions(),
      ]);
      if (cancelled) return;
      const loadedUser = u ?? createInitialUserStatus();
      setWords(ws);
      setWordStats(Object.fromEntries(stats.map((s) => [s.wordId, s])));
      setEncyclopedia(enc);
      setFishHistory(history.sort((a, b) => a.timestamp - b.timestamp));
      setCompanionList(companions);
      setStudySessions(sessions.sort((a, b) => a.timestamp - b.timestamp));
      setGoldLedger(ledger.sort((a, b) => a.timestamp - b.timestamp));
      const now = Date.now();
      if (u) {
        applyOfflineEffects(loadedUser, fish, now);
      } else {
        setUser(loadedUser);
        setFishList(fish);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, []);

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
      const { affection_boost } = getCompanionBuffs(companionRef.current);
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

  const makeCompanion = useCallback(
    (fishId: string) => {
      const fish = fishRef.current.find((f) => f.fishId === fishId);
      if (!fish) return;
      setFishList((list) => list.filter((f) => f.fishId !== fishId));
      void dbDeleteFish(fishId);
      setCompanionList((list) => [...list, fish]);
      void putCompanion(fish);
      pushNotice("🤝", `${fish.name} が相棒になった！好きな時に呼び戻せるよ`);
    },
    [pushNotice]
  );

  const recallCompanion = useCallback(
    (fishId: string): boolean => {
      const fish = companionList.find((f) => f.fishId === fishId);
      if (!fish) return false;
      const { tank_expansion } = getCompanionBuffs(companionRef.current);
      if (fishRef.current.length >= userRef.current.tankCapacity + tank_expansion) return false;
      setCompanionList((list) => list.filter((f) => f.fishId !== fishId));
      void dbDeleteCompanion(fishId);
      const next = [...fishRef.current, fish];
      setFishList(next);
      void putFish(fish);
      pushNotice("🐠", `${fish.name} が帰ってきた！`);
      return true;
    },
    [companionList, pushNotice]
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
    },
    []
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
      const { tank_expansion } = getCompanionBuffs(companionRef.current);
      if (fishRef.current.length >= u.tankCapacity + tank_expansion) return false;
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
    return rollGachaWithWeights(info.weights);
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
  }, []);

  const saveWords = useCallback((newWords: Word[]) => {
    setWords((ws) => {
      const map = new Map(ws.map((w) => [w.id, w]));
      for (const w of newWords) map.set(w.id, w);
      return Array.from(map.values());
    });
    void putWords(newWords);
  }, []);

  const removeWord = useCallback((id: string) => {
    setWords((ws) => ws.filter((w) => w.id !== id));
    setWordStats((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    void dbDeleteWord(id);
  }, []);

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
  }, []);

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

  const removeCustomGenre = useCallback((genre: string) => {
    const u = userRef.current;
    persistUser({ ...u, customGenres: (u.customGenres ?? []).filter((g) => g !== genre) });
  }, [persistUser]);

  // ---------- 管理者：カスタム魚 ----------
  const allFishMaster = useMemo<FishMaster[]>(
    () => [...FISH_MASTER, ...(user.customFish ?? [])],
    [user.customFish]
  );

  const addCustomFish = useCallback(
    (def: CustomFishDef) => {
      const u = userRef.current;
      const existing = u.customFish ?? [];
      if (existing.some((f) => f.type === def.type)) return;
      persistUser({ ...u, customFish: [...existing, def] });
    },
    [persistUser]
  );

  const removeCustomFish = useCallback(
    (fishType: string) => {
      const u = userRef.current;
      persistUser({ ...u, customFish: (u.customFish ?? []).filter((f) => f.type !== fishType) });
    },
    [persistUser]
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
        companionList,
        feedAllFish,
        useMedicine,
        makeCompanion,
        recallCompanion,
        renameFish,
        removeFish,
        buyGachaFish,
        addFishToTank,
        addFishToBox,
        moveBoxFishToTank,
        buyItem,
        saveWord,
        saveWords,
        removeWord,
        recordAnswer,
        allGenres,
        addCustomGenre,
        addCustomGenres,
        removeCustomGenre,
        allFishMaster,
        addCustomFish,
        removeCustomFish,
        resetAllData,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}
