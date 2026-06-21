// IndexedDB ラッパー（設計書 v2.2 §2.1 準拠）
// 注意: 必ずクライアントサイド（useEffect内）からのみ呼び出すこと。

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  EncyclopediaEntry,
  Fish,
  FishHistoryEntry,
  GoldLedgerEntry,
  StudySession,
  UserStatus,
  Word,
  WordStats,
} from "./types";

const DB_NAME = "AquaLinguaDB";
const DB_VERSION = 4; // v4: companions ストア追加

export const LOCAL_USER_ID = "local-user"; // MVP: 認証なしの固定ユーザーID

interface AppDBSchema extends DBSchema {
  words: { key: string; value: Word };
  wordStats: { key: string; value: WordStats };
  userStatus: { key: string; value: UserStatus };
  aquarium: { key: string; value: Fish };
  encyclopedia: { key: string; value: EncyclopediaEntry };
  studySessions: { key: string; value: StudySession };
  goldLedger: { key: string; value: GoldLedgerEntry };
  fishHistory: { key: string; value: FishHistoryEntry };
  companions: { key: string; value: Fish };
}

let dbPromise: Promise<IDBPDatabase<AppDBSchema>> | null = null;

export function getLocalDB(): Promise<IDBPDatabase<AppDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("words", { keyPath: "id" });
          db.createObjectStore("wordStats", { keyPath: "wordId" });
          db.createObjectStore("userStatus", { keyPath: "userId" });
          db.createObjectStore("aquarium", { keyPath: "fishId" });
          db.createObjectStore("encyclopedia", { keyPath: "fishType" });
        }
        if (oldVersion < 2) {
          db.createObjectStore("studySessions", { keyPath: "sessionId" });
          db.createObjectStore("goldLedger", { keyPath: "entryId" });
        }
        if (oldVersion < 3) {
          db.createObjectStore("fishHistory", { keyPath: "entryId" });
        }
        if (oldVersion < 4) {
          db.createObjectStore("companions", { keyPath: "fishId" });
        }
      },
    });
  }
  return dbPromise;
}

// ---------- Words ----------
export async function getAllWords(): Promise<Word[]> {
  return (await getLocalDB()).getAll("words");
}

export async function putWord(word: Word): Promise<void> {
  await (await getLocalDB()).put("words", { ...word, lastUpdated: Date.now() });
}

export async function putWords(words: Word[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("words", "readwrite");
  const now = Date.now();
  await Promise.all(words.map((w) => tx.store.put({ ...w, lastUpdated: now })));
  await tx.done;
}

// 同期専用: LWW マージ済みデータをそのまま保存（lastUpdated を上書きしない）
export async function syncPutWords(words: Word[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("words", "readwrite");
  await Promise.all(words.map((w) => tx.store.put(w)));
  await tx.done;
}

export async function deleteWord(id: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete("words", id);
  await db.delete("wordStats", id);
}

// ---------- WordStats ----------
export async function getAllWordStats(): Promise<WordStats[]> {
  return (await getLocalDB()).getAll("wordStats");
}

export async function putWordStats(stats: WordStats): Promise<void> {
  await (await getLocalDB()).put("wordStats", {
    ...stats,
    lastUpdated: Date.now(),
  });
}

export async function syncPutWordStats(stats: WordStats[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("wordStats", "readwrite");
  await Promise.all(stats.map((s) => tx.store.put(s)));
  await tx.done;
}

// ---------- UserStatus ----------
export function createInitialUserStatus(): UserStatus {
  const now = Date.now();
  return {
    userId: LOCAL_USER_ID,
    gold: 0,
    jobLevel: 1,
    achievedTitles: [],
    lastActiveTime: now,
    lastUpdated: 0, // 0 = 未同期の初期値。クラウドデータが常に勝つようにする
    items: { baitBasic: 5, baitPremium: 0, medicine: 0 },
    tankCapacity: 4,
    totalStudyCount: 0,
    lastRewardDate: "",
    onboardingDone: false,
    customGenres: [],
    deletedWordIds: [],
  };
}

export async function getUserStatus(): Promise<UserStatus | undefined> {
  return (await getLocalDB()).get("userStatus", LOCAL_USER_ID);
}

export async function putUserStatus(status: UserStatus): Promise<void> {
  await (await getLocalDB()).put("userStatus", {
    ...status,
    lastUpdated: status.lastUpdated ?? Date.now(),
  });
}

// ---------- Aquarium ----------
export async function getAllFish(): Promise<Fish[]> {
  return (await getLocalDB()).getAll("aquarium");
}

export async function putFish(fish: Fish): Promise<void> {
  await (await getLocalDB()).put("aquarium", {
    ...fish,
    lastUpdated: Date.now(),
  });
}

export async function putFishList(fishList: Fish[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("aquarium", "readwrite");
  const now = Date.now();
  await Promise.all(
    fishList.map((f) => tx.store.put({ ...f, lastUpdated: now }))
  );
  await tx.done;
}

export async function syncPutFishList(fishList: Fish[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("aquarium", "readwrite");
  await Promise.all(fishList.map((f) => tx.store.put(f)));
  await tx.done;
}

export async function deleteFish(fishId: string): Promise<void> {
  await (await getLocalDB()).delete("aquarium", fishId);
}

export async function clearFishList(): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("aquarium", "readwrite");
  await tx.store.clear();
  await tx.done;
}

// ---------- Encyclopedia ----------
export async function getAllEncyclopedia(): Promise<EncyclopediaEntry[]> {
  return (await getLocalDB()).getAll("encyclopedia");
}

export async function discoverFishType(fishType: string): Promise<void> {
  const db = await getLocalDB();
  const existing = await db.get("encyclopedia", fishType);
  if (!existing) {
    const now = Date.now();
    await db.put("encyclopedia", {
      fishType,
      discoveredAt: now,
      lastUpdated: now,
    });
  }
}

export async function putEncyclopediaEntry(entry: EncyclopediaEntry): Promise<void> {
  await (await getLocalDB()).put("encyclopedia", entry);
}

// ---------- StudySessions（しごと記録） ----------
export async function getAllStudySessions(): Promise<StudySession[]> {
  return (await getLocalDB()).getAll("studySessions");
}

export async function putStudySession(session: StudySession): Promise<void> {
  await (await getLocalDB()).put("studySessions", {
    ...session,
    lastUpdated: Date.now(),
  });
}

export async function syncPutStudySession(session: StudySession): Promise<void> {
  await (await getLocalDB()).put("studySessions", session);
}

// ---------- Companions（相棒おさかな） ----------
export async function getAllCompanions(): Promise<Fish[]> {
  return (await getLocalDB()).getAll("companions");
}

export async function putCompanion(fish: Fish): Promise<void> {
  await (await getLocalDB()).put("companions", {
    ...fish,
    lastUpdated: Date.now(),
  });
}

export async function deleteCompanion(fishId: string): Promise<void> {
  await (await getLocalDB()).delete("companions", fishId);
}

// ---------- FishHistory（歴代おさかな） ----------
export async function getAllFishHistory(): Promise<FishHistoryEntry[]> {
  return (await getLocalDB()).getAll("fishHistory");
}

export async function putFishHistoryEntry(entry: FishHistoryEntry): Promise<void> {
  await (await getLocalDB()).put("fishHistory", {
    ...entry,
    lastUpdated: Date.now(),
  });
}

export async function syncPutFishHistoryEntry(entry: FishHistoryEntry): Promise<void> {
  await (await getLocalDB()).put("fishHistory", entry);
}

// ---------- GoldLedger（ゴールド通帳） ----------
export async function getAllGoldLedger(): Promise<GoldLedgerEntry[]> {
  return (await getLocalDB()).getAll("goldLedger");
}

export async function putGoldLedgerEntry(
  entry: GoldLedgerEntry
): Promise<void> {
  await (await getLocalDB()).put("goldLedger", {
    ...entry,
    lastUpdated: Date.now(),
  });
}

export async function syncPutGoldLedgerEntry(entry: GoldLedgerEntry): Promise<void> {
  await (await getLocalDB()).put("goldLedger", entry);
}

// ---------- 全データ初期化（設定画面の危険ゾーン用） ----------
const ALL_STORES = [
  "words",
  "wordStats",
  "userStatus",
  "aquarium",
  "encyclopedia",
  "studySessions",
  "goldLedger",
  "fishHistory",
  "companions",
] as const;

export async function clearAllData(): Promise<void> {
  const db = await getLocalDB();
  for (const store of ALL_STORES) {
    await db.clear(store);
  }
}

// ---------- JSONバックアップ（設定画面のセーブ/ロード用） ----------
export interface BackupData {
  version: number;
  exportedAt: number;
  words: Word[];
  wordStats: WordStats[];
  userStatus: UserStatus[];
  aquarium: Fish[];
  encyclopedia: EncyclopediaEntry[];
  studySessions: StudySession[];
  goldLedger: GoldLedgerEntry[];
  fishHistory: FishHistoryEntry[];
  companions: Fish[];
}

export async function exportAllData(): Promise<BackupData> {
  const db = await getLocalDB();
  return {
    version: DB_VERSION,
    exportedAt: Date.now(),
    words: await db.getAll("words"),
    wordStats: await db.getAll("wordStats"),
    userStatus: await db.getAll("userStatus"),
    aquarium: await db.getAll("aquarium"),
    encyclopedia: await db.getAll("encyclopedia"),
    studySessions: await db.getAll("studySessions"),
    goldLedger: await db.getAll("goldLedger"),
    fishHistory: await db.getAll("fishHistory"),
    companions: await db.getAll("companions"),
  };
}

// バックアップJSONを取り込む（既存データはすべて置き換え）
export async function importAllData(data: BackupData): Promise<void> {
  const db = await getLocalDB();
  await clearAllData();
  for (const w of data.words ?? []) await db.put("words", w);
  for (const s of data.wordStats ?? []) await db.put("wordStats", s);
  for (const u of data.userStatus ?? []) await db.put("userStatus", u);
  for (const f of data.aquarium ?? []) await db.put("aquarium", f);
  for (const e of data.encyclopedia ?? []) await db.put("encyclopedia", e);
  for (const ss of data.studySessions ?? []) await db.put("studySessions", ss);
  for (const g of data.goldLedger ?? []) await db.put("goldLedger", g);
  for (const h of data.fishHistory ?? []) await db.put("fishHistory", h);
  for (const c of data.companions ?? []) await db.put("companions", c);
}
