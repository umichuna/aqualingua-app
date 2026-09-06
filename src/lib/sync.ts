import * as db from "./db";
import type { Fish, Tank, UserStatus } from "./types";

// 同期の失敗理由を、非エンジニアにも分かる日本語メッセージに変換する。該当しなければ null。
// mode は文言の出し分けに使う（"push" = 💾セーブ / "pull" = ☁️復元）。
export function friendlySyncErrorMessage(
  rawMessage: string,
  mode: "push" | "pull" = "push"
): string | null {
  // Azure SQL 無料枠（月10万vCore秒、毎月1日リセット）の使い切り
  if (/free\s*(offer|limit|amount)|monthly\s*(usage\s*)?limit|reached\s+its\s+.*limit/i.test(rawMessage)) {
    return "今月のデータベース無料枠を使い切りました。毎月1日に自動リセットされるまでクラウド同期は使えません（データは端末内に保存されています）";
  }
  // DBのユーザー名とパスワードが一致しない。
  // 注意点が2つあり、どちらも実際に踏んだのでメッセージに含める:
  //  1. Vercel の環境変数は「変更しただけ」では動いている本番に反映されない（再デプロイが必要）
  //  2. アプリの接続ユーザーは master のサーバーログインとして作られていたため、
  //     アプリDB側で ALTER USER ... WITH PASSWORD しても変更できない
  //     （包含データベースユーザーに作り替えるのが Portal だけで完結して楽。手順は STATUS_REPORT）
  if (/login failed for user/i.test(rawMessage)) {
    return "データベースのパスワードが一致しません。①Vercel の環境変数 AZURE_SQL_PASSWORD を確認 ②変更したら必ず再デプロイ（再デプロイしないと反映されません）③それでも直らない場合はDB側のパスワードが変わっていない可能性があります（手順は STATUS_REPORT.md を参照）";
  }
  // ログインの有効期限切れ（サーバー側が 401 を返した）
  if (/unauthorized/i.test(rawMessage)) {
    return "ログインの有効期限が切れています。設定からログインし直してから、もう一度お試しください";
  }
  // 送信データが大きすぎる（サーバー側の上限 4.5MB を超えた）。
  // 実例: 水槽の背景画像1枚が 2.41MB になっており、保存が丸ごと失敗していた。
  // 画像は base64 のまま userStatus に入って1リクエストで送られるため、
  // 大きい画像を設定するとこの経路で詰まる。
  // 送信前チェックで自前に組み立てた日本語メッセージは、そのまま表示する
  // （原因の内訳まで含んでいるため、汎用文言で上書きしない）
  if (rawMessage.includes("保存するデータが大きすぎます")) {
    return rawMessage;
  }
  if (/payload too large|content too large|request entity too large|\b413\b/i.test(rawMessage)) {
    return "データが大きすぎて保存できませんでした。水槽の背景画像やカスタム魚の画像が大きい可能性があります。アプリを開き直すと背景画像は自動で軽くされます（それでも直らない場合は、大きい背景画像を設定し直してください）";
  }
  // 通信の打ち切り（DBの起動待ちで50秒を超えた等）。
  // push はサーバー側の書き込みが続いて成功していることがあるため「失敗」と断定しない。
  //
  // ⚠️ 素の `abort` / `aborted` にマッチさせてはいけない。mssql はトランザクション内の
  // SQL が1つでも失敗すると `TransactionError: Transaction has been aborted.` を投げ、
  // push 全体はトランザクションなので「SQLエラー全般」がこの文言になる。これを
  // タイムアウト扱いすると「保存できているかもしれないので ☁️復元 で確認を」と案内して
  // しまい、実際はロールバック済みなのでユーザーが未保存のローカルデータを古いクラウド
  // データで上書きして失う（tarn の `Error('aborted')` も同様）。
  // タイムアウトだけを積極的に特定する:
  //  - `Timeout: Request failed to complete in 30000ms`（tedious のクエリタイムアウト）
  //  - `Failed to connect to ... in 30000ms`（tedious の接続タイムアウト＝コールドスタート）
  //  - AbortSignal.timeout() の `signal timed out` / `aborted due to timeout`
  const isTimeout =
    /timed out|aborted due to timeout/i.test(rawMessage) ||
    /\btimeout\b/i.test(rawMessage) ||
    /failed to connect to .+ in \d+\s*ms/i.test(rawMessage);
  if (isTimeout) {
    return mode === "push"
      ? "時間切れになりました（データベースの起動待ちの可能性）。実際には保存できている場合があるので、少し待ってから ☁️復元 で保存内容を確かめてください"
      : "時間切れになりました（データベースの起動待ちの可能性）。少し待ってから、もう一度お試しください";
  }
  return null;
}

// クラウドの userStatus がローカルより古い場合に無条件で上書きすると、
// 「PCで実績報酬を受け取り→クラウドセーブ→スマホで同期」のような手順で
// スマホ側のローカルデータ（未セーブ）が新しくても巻き戻ってしまう。
// 単調増加・集合系のフィールドは「大きい方/和集合」を採用し、
// それ以外は新しい方（ローカル）を優先して安全にマージする。
function mergeUserStatus(local: UserStatus, cloud: UserStatus): UserStatus {
  const unionArr = <T,>(a?: T[], b?: T[]): T[] => Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  // lastActiveTime は必ず新しい方を採る。巻き戻ると、既に消化した日数ぶんの
  // 放置ペナルティ（好感度低下・病気・逃走）が二重に適用されてしまう
  const newerActive = Math.max(local.lastActiveTime ?? 0, cloud.lastActiveTime ?? 0);
  if (cloud.lastUpdated >= local.lastUpdated) {
    // クラウドの方が新しい通常ケース: ベースはクラウドを採用する。
    // ただし墓標を素通しで捨てると、ローカルにしか無い「削除した」記録が失われ、
    // 別端末が後から push した単語・魚が次回の pull で復活してしまう
    return {
      ...cloud,
      lastActiveTime: newerActive,
      deletedWordIds: unionArr(local.deletedWordIds, cloud.deletedWordIds),
      deletedFishIds: unionArr(local.deletedFishIds, cloud.deletedFishIds),
    };
  }
  // ローカルの方が新しい: クラウド上書きで消えると困る項目を救済しつつ
  // ベースはローカル（新しい方）を採用する
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
    lastActiveTime: newerActive,
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
    deletedFishIds: unionArr(local.deletedFishIds, cloud.deletedFishIds),
    lastUpdated: Date.now(),
  };
}

// Vercel のリクエスト本文の上限は 4.5MB。余裕を見て手前で止める。
const PUSH_BODY_LIMIT_BYTES = 4_000_000;

// 送信データが上限を超えたとき、「何が大きいのか」まで含めた日本語メッセージを作る。
// 画像は base64 のまま userStatus に入るため、実際に詰まるのはほぼ画像である。
function describeOversizedPayload(
  payload: { userStatus?: UserStatus | null },
  totalBytes: number
): string {
  const mb = (n: number) => (n / 1048576).toFixed(1);
  const u = payload.userStatus;
  const tanksBytes = JSON.stringify(u?.tanks ?? []).length;
  const customFishBytes = JSON.stringify((u as { customFish?: unknown })?.customFish ?? []).length;

  const culprits: string[] = [];
  if (tanksBytes > 500_000) culprits.push(`水槽の背景画像（約${mb(tanksBytes)}MB）`);
  if (customFishBytes > 500_000) culprits.push(`カスタム魚の画像（約${mb(customFishBytes)}MB）`);

  const what = culprits.length > 0 ? `原因は${culprits.join("と")}です。` : "";
  return (
    `保存するデータが大きすぎます（約${mb(totalBytes)}MB / 上限4.5MB）。${what}` +
    `アプリを開き直すと背景画像は自動で軽くなります。それでも直らない場合は、` +
    `大きい背景画像を設定し直すか、使っていないカスタム魚を減らしてください`
  );
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
 * @returns restored: 何か1つでも復元したら true。クラウドが完全に空なら false。
 *   brokenRows: 壊れていて復元できなかった行数（0でなければ利用者に知らせる）。
 */
export async function pullFromCloud(
  userId: string
): Promise<{ restored: boolean; brokenRows: number }> {
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
    const localBeforeStatus = await db.getUserStatus();
    if (cloudData.userStatus) {
      const c = cloudData.userStatus as UserStatus;
      const merged = localBeforeStatus ? mergeUserStatus(localBeforeStatus, c) : c;
      await db.putUserStatus(merged);
      restored = true;
    }

    // 削除済み単語の墓標（ローカル・クラウド両方の和集合）。
    // これを使わないと、別端末がまだ持っている単語を push した後にこちらが pull すると、
    // 自分で削除した単語が復活してしまう。
    // （クラウドが新しいと mergeUserStatus はクラウドをそのまま採用するため、
    //   ローカル側の墓標もここで明示的に足しておく）
    const deletedWordIds = new Set<string>([
      ...(localBeforeStatus?.deletedWordIds ?? []),
      ...((cloudData.userStatus as UserStatus | undefined)?.deletedWordIds ?? []),
    ]);

    // 各テーブル: クラウドに1件以上あるときだけ、ローカルを丸ごと置き換える
    if (Array.isArray(cloudData.words) && cloudData.words.length > 0) {
      const words = (cloudData.words as { id: string }[]).filter((w) => !deletedWordIds.has(w.id));
      await db.replaceWords(words as Parameters<typeof db.replaceWords>[0]);
      restored = true;
    }
    if (Array.isArray(cloudData.wordStats) && cloudData.wordStats.length > 0) {
      // 単語を除いたのに成績だけ残ると、苦手の件数が実在しない単語ぶん増えてしまう
      const stats = (cloudData.wordStats as { wordId: string }[]).filter(
        (s) => !deletedWordIds.has(s.wordId)
      );
      await db.replaceWordStats(stats as Parameters<typeof db.replaceWordStats>[0]);
      restored = true;
    }
    {
      // 逃げた魚・にがした魚が、別端末の push 経由で復活しないように墓標で除外する
      const deletedFishIds = new Set<string>([
        ...(localBeforeStatus?.deletedFishIds ?? []),
        ...((cloudData.userStatus as UserStatus | undefined)?.deletedFishIds ?? []),
      ]);
      const cloudFish: Fish[] = (Array.isArray(cloudData.fish) ? cloudData.fish : []).filter(
        (f: Fish) => !deletedFishIds.has(f.fishId)
      );
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

    const brokenRows = typeof cloudData.brokenRows === "number" ? cloudData.brokenRows : 0;
    console.log(
      `[Sync] Restore completed for userId: ${userId} (restored=${restored}, brokenRows=${brokenRows})`
    );
    return { restored, brokenRows };
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
 *   skippedEmptyTables: 未同期の新端末が空を送ったため、サーバーが消さずに残したテーブル
 *   （＝復元前に保存しようとした状態。先に ☁️復元 が必要）。
 */
export async function pushToCloud(
  userId: string,
  allowEmpty = false
): Promise<{ userStatusStale: boolean; skippedEmptyTables: string[] }> {
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
      // 手元が空のテーブルでクラウドを上書きしてよいか。既定 false（サーバーが消さずに
      // スキップして知らせる）。ユーザーが「意図的に空にした」と了承した再送でだけ true。
      allowEmpty,
    };

    // 送信前に大きさを確認する。サーバー（Vercel）のリクエスト上限は 4.5MB で、
    // 超えると本文がサーバーに届かないまま 413 になり「原因不明の失敗」に見える。
    // 事前に判定して、何が大きいのかまで含めて日本語で伝える。
    const body = JSON.stringify(payload);
    if (body.length > PUSH_BODY_LIMIT_BYTES) {
      throw new Error(describeOversizedPayload(payload, body.length));
    }

    // Azure SQL コールドスタート対策: 50秒タイムアウト
    const response = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(50_000),
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${await readError(response)}`);
    }

    const result = await response.json().catch(() => ({}));
    console.log(`[Sync] Push completed for userId: ${userId}`);
    return {
      userStatusStale: !!result.userStatusStale,
      skippedEmptyTables: Array.isArray(result.skippedEmptyTables) ? result.skippedEmptyTables : [],
    };
  } catch (error) {
    console.error("[Sync] Push failed:", error);
    throw error;
  }
}
