import * as db from "./db";
import type { Fish } from "./types";

/**
 * クラウド（Azure SQL）からデータを pull してローカル（IndexedDB）とマージ
 * LWW（Last Write Wins）: lastUpdated が新しい方を採用
 */
export async function pullFromCloud(userId: string): Promise<void> {
  try {
    console.log(`[Sync] Pulling from cloud for userId: ${userId}`);

    const response = await fetch("/api/sync/pull", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Pull failed: ${response.statusText}`);
    }

    const cloudData = await response.json();

    // userStatus（単一レコード）をマージ
    if (cloudData.userStatus) {
      const localUserStatus = await db.getUserStatus();
      const merged = mergeLWW(localUserStatus, cloudData.userStatus);
      await db.putUserStatus(merged);
    }

    // words テーブル → IndexedDB `words` ストア
    if (cloudData.words && Array.isArray(cloudData.words)) {
      const localWords = await db.getAllWords();
      // userStatus pull 後の deletedWordIds で削除済み単語の復活を防ぐ
      const latestUser = await db.getUserStatus();
      const deletedWordIds = new Set(latestUser?.deletedWordIds ?? []);
      const mergedWords = cloudData.words
        .filter((cloudWord: any) => !deletedWordIds.has(cloudWord.id))
        .map((cloudWord: any) => {
          const localWord = localWords.find(w => w.id === cloudWord.id);
          return mergeLWW(localWord, cloudWord);
        });
      await db.putWords(mergedWords);
    }

    // word_stats テーブル → IndexedDB `wordStats` ストア
    if (cloudData.wordStats && Array.isArray(cloudData.wordStats)) {
      const localStats = await db.getAllWordStats();
      const mergedStats = cloudData.wordStats.map((cloudStat: any) => {
        const localStat = localStats.find(s => s.wordId === cloudStat.wordId);
        return mergeLWW(localStat, cloudStat);
      });
      for (const stat of mergedStats) {
        await db.putWordStats(stat);
      }
    }

    // fish テーブル → IndexedDB `aquarium` ストア
    // clear+rewrite: クラウドにない削除済み魚がゾンビ復活しないように
    {
      const localFish = await db.getAllFish();
      const cloudFish: Fish[] = Array.isArray(cloudData.fish) ? cloudData.fish : [];
      const cloudIds = new Set(cloudFish.map(f => f.fishId));

      // 「水槽に戻すべきでない」魚IDを収集
      // 1) boxFish: ボックスに移した魚
      const latestUser = await db.getUserStatus();
      const boxFishIds = new Set((latestUser?.boxFish ?? []).map((f: Fish) => f.fishId));

      // 2) fishHistory: 逃走・放流など「去った魚」の fishId（旧データは undefined のため filter で除去）
      const localHistory = await db.getAllFishHistory();
      const goneFishIds = new Set(
        localHistory.map(h => (h as { fishId?: string }).fishId).filter((id): id is string => !!id)
      );

      const excludeIds = new Set([...boxFishIds, ...goneFishIds]);

      // クラウドの魚と LWW マージ（除外IDは復活させない）
      const mergedFromCloud = cloudFish
        .filter((cloudF: Fish) => !excludeIds.has(cloudF.fishId))
        .map((cloudF: Fish) => {
          const localF = localFish.find(f => f.fishId === cloudF.fishId);
          return mergeLWW(localF, cloudF);
        });

      // ローカルにしかない魚（まだ push されていない新規魚）も保持（除外IDは含まない）
      const localOnly = localFish.filter(f => !cloudIds.has(f.fishId) && !excludeIds.has(f.fishId));

      await db.clearFishList();
      const allMerged = [...mergedFromCloud, ...localOnly];
      if (allMerged.length > 0) await db.putFishList(allMerged);
    }

    // encyclopedia テーブル → IndexedDB `encyclopedia` ストア
    if (cloudData.encyclopedia && Array.isArray(cloudData.encyclopedia)) {
      const localEncy = await db.getAllEncyclopedia();
      const mergedEncy = cloudData.encyclopedia.map((cloudE: any) => {
        const localE = localEncy.find(e => e.fishType === cloudE.fishType);
        return mergeLWW(localE, cloudE);
      });
      for (const ency of mergedEncy) {
        await db.discoverFishType(ency.fishType);
      }
    }

    // study_sessions テーブル → IndexedDB `studySessions` ストア
    if (cloudData.studySessions && Array.isArray(cloudData.studySessions)) {
      const localSessions = await db.getAllStudySessions();
      const mergedSessions = cloudData.studySessions.map((cloudSession: any) => {
        const localSession = localSessions.find(s => s.sessionId === cloudSession.sessionId);
        return mergeLWW(localSession, cloudSession);
      });
      for (const session of mergedSessions) {
        await db.putStudySession(session);
      }
    }

    // gold_ledger テーブル → IndexedDB `goldLedger` ストア
    if (cloudData.goldLedger && Array.isArray(cloudData.goldLedger)) {
      const localLedger = await db.getAllGoldLedger();
      const mergedLedger = cloudData.goldLedger.map((cloudEntry: any) => {
        const localEntry = localLedger.find(e => e.entryId === cloudEntry.entryId);
        return mergeLWW(localEntry, cloudEntry);
      });
      for (const entry of mergedLedger) {
        await db.putGoldLedgerEntry(entry);
      }
    }

    // fish_history テーブル → IndexedDB `fishHistory` ストア
    if (cloudData.fishHistory && Array.isArray(cloudData.fishHistory)) {
      const localHistory = await db.getAllFishHistory();
      const mergedHistory = cloudData.fishHistory.map((cloudEntry: any) => {
        const localEntry = localHistory.find(e => e.entryId === cloudEntry.entryId);
        return mergeLWW(localEntry, cloudEntry);
      });
      for (const entry of mergedHistory) {
        await db.putFishHistoryEntry(entry);
      }
    }

    console.log(`[Sync] Pull completed for userId: ${userId}`);
  } catch (error) {
    console.error("[Sync] Pull failed:", error);
    throw error;
  }
}

/**
 * ローカル（IndexedDB）の変更データをクラウド（Azure SQL）に push
 * 変更前後の差分を検出して push
 */
export async function pushToCloud(userId: string): Promise<void> {
  try {
    console.log(`[Sync] Pushing to cloud for userId: ${userId}`);

    // 各テーブルから全レコード取得
    const userStatus = await db.getUserStatus();
    const words = await db.getAllWords();
    const wordStats = await db.getAllWordStats();
    const fish = await db.getAllFish();
    const encyclopedia = await db.getAllEncyclopedia();
    const studySessions = await db.getAllStudySessions();
    const goldLedger = await db.getAllGoldLedger();
    const fishHistory = await db.getAllFishHistory();

    const payload = {
      userStatus,
      words,
      wordStats,
      fish,
      encyclopedia,
      studySessions,
      goldLedger,
      fishHistory,
    };

    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.statusText}`);
    }

    console.log(`[Sync] Push completed for userId: ${userId}`);
  } catch (error) {
    console.error("[Sync] Push failed:", error);
    throw error;
  }
}

/**
 * LWW（Last Write Wins）: lastUpdated を比較して新しい方を返す
 * @param local ローカルレコード（IndexedDB）
 * @param cloud クラウドレコード（Azure SQL）
 * @returns マージ後のレコード
 */
function mergeLWW<T extends { lastUpdated?: number }>(local: T | undefined, cloud: T): T {
  if (!local) {
    return cloud;
  }

  const localTime = local.lastUpdated ?? 0;
  const cloudTime = cloud.lastUpdated ?? 0;

  if (cloudTime >= localTime) {
    return cloud;
  }

  return local;
}
