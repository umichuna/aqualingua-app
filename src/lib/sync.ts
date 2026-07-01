import * as db from "./db";
import type { Fish } from "./types";

// サーバーが返した実エラー文言（{ error } JSON）を読み取る。無ければ statusText。
async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない場合は無視
  }
  return response.statusText || `HTTP ${response.status}`;
}

/**
 * クラウド（Azure SQL）から「復元」する。
 * 方針: クラウドを正としてローカルを置き換える（ユーザー決定）。
 * 安全策: クラウドにデータがある種類だけ置き換える。
 *   → まだ一度もセーブしていない（クラウドが空の）状態で手元を全消ししないため。
 * @returns 何か1つでも復元したら true。クラウドが完全に空なら false。
 */
export async function pullFromCloud(userId: string): Promise<boolean> {
  try {
    console.log(`[Sync] Restoring from cloud for userId: ${userId}`);

    // Azure SQL コールドスタート対策: 50秒タイムアウト
    const response = await fetch("/api/sync/pull", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(50_000),
    });

    if (!response.ok) {
      throw new Error(`Pull failed: ${await readError(response)}`);
    }

    const cloudData = await response.json();
    let restored = false;

    // userStatus（所持金・累計・カスタム魚・onboardingDone などを含む単一レコード）
    if (cloudData.userStatus) {
      await db.putUserStatus(cloudData.userStatus);
      restored = true;
    }

    // 各テーブル: クラウドに1件以上あるときだけ、ローカルを丸ごと置き換える
    if (Array.isArray(cloudData.words) && cloudData.words.length > 0) {
      await db.replaceWords(cloudData.words);
      restored = true;
    }
    if (Array.isArray(cloudData.wordStats) && cloudData.wordStats.length > 0) {
      await db.replaceWordStats(cloudData.wordStats);
      restored = true;
    }
    {
      const cloudFish: Fish[] = Array.isArray(cloudData.fish) ? cloudData.fish : [];
      if (cloudFish.length > 0) {
        await db.clearFishList();
        await db.syncPutFishList(cloudFish);
        restored = true;
      }
    }
    if (Array.isArray(cloudData.encyclopedia) && cloudData.encyclopedia.length > 0) {
      await db.replaceEncyclopedia(cloudData.encyclopedia);
      restored = true;
    }
    if (Array.isArray(cloudData.studySessions) && cloudData.studySessions.length > 0) {
      await db.replaceStudySessions(cloudData.studySessions);
      restored = true;
    }
    if (Array.isArray(cloudData.goldLedger) && cloudData.goldLedger.length > 0) {
      await db.replaceGoldLedger(cloudData.goldLedger);
      restored = true;
    }
    if (Array.isArray(cloudData.fishHistory) && cloudData.fishHistory.length > 0) {
      await db.replaceFishHistory(cloudData.fishHistory);
      restored = true;
    }

    console.log(`[Sync] Restore completed for userId: ${userId} (restored=${restored})`);
    return restored;
  } catch (error) {
    console.error("[Sync] Restore failed:", error);
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

    // Azure SQL コールドスタート対策: 50秒タイムアウト
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50_000),
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${await readError(response)}`);
    }

    console.log(`[Sync] Push completed for userId: ${userId}`);
  } catch (error) {
    console.error("[Sync] Push failed:", error);
    throw error;
  }
}
