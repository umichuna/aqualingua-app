import * as db from "./db";
import type { Fish, Tank, UserStatus } from "./types";

// Azure SQL 無料枠（月10万vCore秒、毎月1日リセット）を使い切ったときのエラーを検知して、
// 非エンジニアにも分かる日本語メッセージに変換する。該当しなければ null。
export function friendlySyncErrorMessage(rawMessage: string): string | null {
  if (/free\s*(offer|limit|amount)|monthly\s*(usage\s*)?limit|reached\s+its\s+.*limit/i.test(rawMessage)) {
    return "今月のデータベース無料枠を使い切りました。毎月1日に自動リセットされるまでクラウド同期は使えません（データは端末内に保存されています）";
  }
  return null;
}

// クラウドの userStatus がローカルより古い場合に無条件で上書きすると、
// 「PCで実績報酬を受け取り→クラウドセーブ→スマホで同期」のような手順で
// スマホ側のローカルデータ（未セーブ）が新しくても巻き戻ってしまう。
// 単調増加・集合系のフィールドは「大きい方/和集合」を採用し、
// それ以外は新しい方（ローカル）を優先して安全にマージする。
function mergeUserStatus(local: UserStatus, cloud: UserStatus): UserStatus {
  if (cloud.lastUpdated >= local.lastUpdated) {
    // クラウドの方が新しい通常ケース: そのまま採用
    return cloud;
  }
  // ローカルの方が新しい: クラウド上書きで消えると困る項目を救済しつつ
  // ベースはローカル（新しい方）を採用する
  const unionArr = <T,>(a?: T[], b?: T[]): T[] => Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  // 水槽（1槽3000G）は id 基準の和集合で救済する。
  // 単純にローカル優先にすると、別端末で買った水槽が消えてしまうため。
  // 同じ id が両方にある場合は、名前・背景画像の編集を尊重してローカル側を採用する。
  const mergeTanks = (a?: Tank[], b?: Tank[]): Tank[] | undefined => {
    if (!a && !b) return undefined;
    const byId = new Map<string, Tank>();
    for (const t of b ?? []) byId.set(t.id, t);
    for (const t of a ?? []) byId.set(t.id, t);
    return Array.from(byId.values());
  };
  return {
    ...local,
    tanks: mergeTanks(local.tanks, cloud.tanks),
    tankCapacity: Math.max(local.tankCapacity ?? 0, cloud.tankCapacity ?? 0),
    boxCapacity: Math.max(local.boxCapacity ?? 0, cloud.boxCapacity ?? 0),
    lifetimeGoldEarned: Math.max(local.lifetimeGoldEarned ?? 0, cloud.lifetimeGoldEarned ?? 0),
    lifetimeWordsAnswered: Math.max(local.lifetimeWordsAnswered ?? 0, cloud.lifetimeWordsAnswered ?? 0),
    claimedAchievementRewards: unionArr(local.claimedAchievementRewards, cloud.claimedAchievementRewards),
    unlockedAchievements: unionArr(local.unlockedAchievements, cloud.unlockedAchievements),
    achievedTitles: unionArr(local.achievedTitles, cloud.achievedTitles),
    customGenres: unionArr(local.customGenres, cloud.customGenres),
    deletedWordIds: unionArr(local.deletedWordIds, cloud.deletedWordIds),
    lastUpdated: Date.now(),
  };
}

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
 * 方針: クラウドを正としてローカルを置き換える。ただし userStatus のみ、
 *   ローカルの方が新しい場合は安全マージする（mergeUserStatus 参照）。
 *   これは「PCでセーブ→スマホで同期」の間にスマホ側でローカル変更が
 *   発生していた場合に、その変更が黙って消し飛ぶ事故を防ぐため。
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
      const localBefore = await db.getUserStatus();
      const c = cloudData.userStatus as UserStatus;
      const willRollback = !!localBefore && c.lastUpdated < localBefore.lastUpdated;
      console.warn(
        "[SyncDebug] PULL userStatus",
        {
          local: localBefore && { tankCapacity: localBefore.tankCapacity, boxCapacity: localBefore.boxCapacity, gold: localBefore.gold, items: localBefore.items, lastUpdated: localBefore.lastUpdated },
          cloud: { tankCapacity: c.tankCapacity, boxCapacity: c.boxCapacity, gold: c.gold, items: c.items, lastUpdated: c.lastUpdated },
          willRollback,
          action: willRollback ? "merge（ローカル優先+救済フィールド合成）" : "cloud採用",
        }
      );
      const merged = localBefore ? mergeUserStatus(localBefore, c) : c;
      await db.putUserStatus(merged);
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
    if (Array.isArray(cloudData.blankQuestions) && cloudData.blankQuestions.length > 0) {
      await db.replaceBlankQuestions(cloudData.blankQuestions);
      restored = true;
    }
    if (Array.isArray(cloudData.blankQuestionStats) && cloudData.blankQuestionStats.length > 0) {
      await db.replaceBlankQuestionStats(cloudData.blankQuestionStats);
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
 * @returns userStatusStale: true の場合、クラウド側に自分より新しい userStatus が
 *   既にあり、今回の userStatus 書き込みはスキップされた（＝先に☁️同期が必要）。
 */
export async function pushToCloud(userId: string): Promise<{ userStatusStale: boolean }> {
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
    const blankQuestions = await db.getAllBlankQuestions();
    const blankQuestionStats = await db.getAllBlankQuestionStats();

    // ---- 調査ログ: push がクラウドへ送る userStatus の中身 ----
    console.warn(
      "[SyncDebug] PUSH userStatus",
      userStatus && {
        tankCapacity: userStatus.tankCapacity,
        boxCapacity: userStatus.boxCapacity,
        gold: userStatus.gold,
        items: userStatus.items,
        lastUpdated: userStatus.lastUpdated,
      }
    );

    const payload = {
      userStatus,
      words,
      wordStats,
      fish,
      encyclopedia,
      studySessions,
      goldLedger,
      fishHistory,
      blankQuestions,
      blankQuestionStats,
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

    const result = await response.json().catch(() => ({}));
    console.log(`[Sync] Push completed for userId: ${userId}`);
    return { userStatusStale: !!result.userStatusStale };
  } catch (error) {
    console.error("[Sync] Push failed:", error);
    throw error;
  }
}
