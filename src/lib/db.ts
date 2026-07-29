// IndexedDB ラッパー（設計書 v2.2 §2.1 準拠）
// 注意: 必ずクライアントサイド（useEffect内）からのみ呼び出すこと。

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  BlankQuestion,
  BlankQuestionStats,
  CustomFishDef,
  EncyclopediaEntry,
  Fish,
  FishHistoryEntry,
  FishOverride,
  GoldLedgerEntry,
  StudySession,
  UserStatus,
  Word,
  WordStats,
} from "./types";

const DB_NAME = "AquaLinguaDB";
const DB_VERSION = 7; // v7: sharedCustomFish（全員共有カスタム魚のローカルキャッシュ）ストア追加

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
  fishOverrides: { key: string; value: FishOverride };
  blankQuestions: { key: string; value: BlankQuestion };
  blankQuestionStats: { key: string; value: BlankQuestionStats };
  sharedCustomFish: { key: string; value: CustomFishDef };
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
        if (oldVersion < 5) {
          db.createObjectStore("fishOverrides", { keyPath: "type" });
        }
        if (oldVersion < 6) {
          db.createObjectStore("blankQuestions", { keyPath: "id" });
          db.createObjectStore("blankQuestionStats", { keyPath: "id" });
        }
        if (oldVersion < 7) {
          db.createObjectStore("sharedCustomFish", { keyPath: "type" });
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

// ---------- クラウド復元用: 各ストアをまるごと置き換える（clear → put） ----------
// 同期（クラウド=正）の pull で使用。lastUpdated は上書きしない。
async function replaceStore<K extends "words" | "wordStats" | "encyclopedia" | "studySessions" | "goldLedger" | "fishHistory" | "blankQuestions" | "blankQuestionStats">(
  storeName: K,
  records: AppDBSchema[K]["value"][]
): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction(storeName, "readwrite");
  await tx.store.clear();
  // 型の都合上 any キャストせず put（各ストアの value 型に一致）
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function replaceWords(words: Word[]): Promise<void> {
  await replaceStore("words", words);
}
export async function replaceWordStats(stats: WordStats[]): Promise<void> {
  await replaceStore("wordStats", stats);
}
export async function replaceEncyclopedia(entries: EncyclopediaEntry[]): Promise<void> {
  await replaceStore("encyclopedia", entries);
}
export async function replaceStudySessions(sessions: StudySession[]): Promise<void> {
  await replaceStore("studySessions", sessions);
}
export async function replaceGoldLedger(entries: GoldLedgerEntry[]): Promise<void> {
  await replaceStore("goldLedger", entries);
}
export async function replaceFishHistory(entries: FishHistoryEntry[]): Promise<void> {
  await replaceStore("fishHistory", entries);
}
export async function replaceBlankQuestions(qs: BlankQuestion[]): Promise<void> {
  await replaceStore("blankQuestions", qs);
}
export async function replaceBlankQuestionStats(stats: BlankQuestionStats[]): Promise<void> {
  await replaceStore("blankQuestionStats", stats);
}
// 魚は clearFishList() + syncPutFishList() を流用するため専用ヘルパーは不要

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
  "blankQuestions",
  "blankQuestionStats",
  // 組み込み魚の編集内容・全員共有カスタム魚のローカルキャッシュ。
  // ここに入れ忘れると「JSONロードしても魚の編集が戻らない」「全データ初期化しても残る」
  // という取りこぼしになる（どちらも共有APIから再取得はされる）。
  "fishOverrides",
  "sharedCustomFish",
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
  blankQuestions?: BlankQuestion[];
  blankQuestionStats?: BlankQuestionStats[];
  fishOverrides?: FishOverride[];
  sharedCustomFish?: CustomFishDef[];
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
    blankQuestions: await db.getAll("blankQuestions"),
    blankQuestionStats: await db.getAll("blankQuestionStats"),
    fishOverrides: await db.getAll("fishOverrides"),
    sharedCustomFish: await db.getAll("sharedCustomFish"),
  };
}

// バックアップJSONを取り込む（既存データはすべて置き換え）
// 注意: 旧形式バックアップ（blankQuestions / blankQuestionStats / fishOverrides /
// sharedCustomFish フィールドが無い）を読み込んだ場合、そのまま clearAllData すると
// それらが全消失してしまうため、フィールド自体が未定義（≠空配列）のときは
// 取り込み前の既存データを退避して残す。
export async function importAllData(data: BackupData): Promise<void> {
  const db = await getLocalDB();
  const keepBlankQuestions = data.blankQuestions === undefined ? await db.getAll("blankQuestions") : null;
  const keepBlankQuestionStats = data.blankQuestionStats === undefined ? await db.getAll("blankQuestionStats") : null;
  const keepFishOverrides = data.fishOverrides === undefined ? await db.getAll("fishOverrides") : null;
  const keepSharedCustomFish = data.sharedCustomFish === undefined ? await db.getAll("sharedCustomFish") : null;
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
  for (const q of data.blankQuestions ?? keepBlankQuestions ?? []) await db.put("blankQuestions", q);
  for (const st of data.blankQuestionStats ?? keepBlankQuestionStats ?? []) await db.put("blankQuestionStats", st);
  for (const o of data.fishOverrides ?? keepFishOverrides ?? []) await db.put("fishOverrides", o);
  for (const cf of data.sharedCustomFish ?? keepSharedCustomFish ?? []) await db.put("sharedCustomFish", cf);
}

// ---------- FishOverrides（組み込み魚編集用） ----------
export async function getAllFishOverrides(): Promise<FishOverride[]> {
  return (await getLocalDB()).getAll("fishOverrides");
}

export async function getFishOverride(type: string): Promise<FishOverride | undefined> {
  return (await getLocalDB()).get("fishOverrides", type);
}

export async function putFishOverride(override: FishOverride): Promise<void> {
  await (await getLocalDB()).put("fishOverrides", {
    ...override,
    lastUpdated: override.lastUpdated ?? Date.now(),
  });
}

// クラウドから取得した編集内容をローカルにも保存（lastUpdated は上書きしない）。
// 次回起動時にクラウドを待たず即座に正しい画像を出すためのキャッシュ。
export async function putFishOverridesBulk(list: FishOverride[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("fishOverrides", "readwrite");
  await Promise.all(list.map((o) => tx.store.put(o)));
  await tx.done;
}

export async function deleteFishOverride(type: string): Promise<void> {
  await (await getLocalDB()).delete("fishOverrides", type);
}

// ---------- SharedCustomFish（全員共有カスタム魚のローカルキャッシュ） ----------
// クラウド（shared_custom_fish）から取得した魚をローカルにも保存し、次回起動時に
// クラウドを待たず即座に図鑑・水槽へ正しい画像を出すためのキャッシュ。
export async function getAllSharedCustomFish(): Promise<CustomFishDef[]> {
  return (await getLocalDB()).getAll("sharedCustomFish");
}

export async function replaceSharedCustomFish(list: CustomFishDef[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("sharedCustomFish", "readwrite");
  await tx.store.clear();
  await Promise.all(list.map((f) => tx.store.put(f)));
  await tx.done;
}

// ---------- BlankQuestions（穴抜け問題集） ----------
export async function getAllBlankQuestions(): Promise<BlankQuestion[]> {
  return (await getLocalDB()).getAll("blankQuestions");
}

export async function putBlankQuestion(q: BlankQuestion): Promise<void> {
  await (await getLocalDB()).put("blankQuestions", {
    ...q,
    lastUpdated: Date.now(),
  });
}

export async function putBlankQuestions(qs: BlankQuestion[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("blankQuestions", "readwrite");
  const now = Date.now();
  await Promise.all(qs.map((q) => tx.store.put({ ...q, lastUpdated: now })));
  await tx.done;
}

export async function deleteBlankQuestion(id: string): Promise<void> {
  await (await getLocalDB()).delete("blankQuestions", id);
}

export async function deleteBlankQuestions(ids: string[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction("blankQuestions", "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

// ---------- BlankQuestionStats（穴抜け問題苦手統計） ----------
export async function getAllBlankQuestionStats(): Promise<BlankQuestionStats[]> {
  return (await getLocalDB()).getAll("blankQuestionStats");
}

export async function putBlankQuestionStats(stats: BlankQuestionStats): Promise<void> {
  await (await getLocalDB()).put("blankQuestionStats", {
    ...stats,
    lastUpdated: Date.now(),
  });
}
