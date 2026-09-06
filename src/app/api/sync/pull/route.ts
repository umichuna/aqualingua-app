import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, isConnectionError, resetPool } from "@/lib/azure-sql";
import type sql from "mssql";

// Vercel のサーバー実行時間上限を延長（許可プランで有効。非対応でも無害）
export const maxDuration = 60;

// 穴抜け問題のテーブルは後から追加したため、無ければ自動作成する
// サーバーインスタンスごとに1回確認すれば十分（毎回の存在確認クエリはDB無料枠の無駄遣い）
let blankTablesEnsured = false;
async function ensureBlankTables(pool: sql.ConnectionPool) {
  if (blankTablesEnsured) return;
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'blank_questions')
    CREATE TABLE blank_questions (
      userId NVARCHAR(256) NOT NULL,
      id NVARCHAR(128) NOT NULL,
      data NVARCHAR(MAX) NOT NULL,
      lastUpdated BIGINT NOT NULL,
      PRIMARY KEY (userId, id)
    );
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'blank_question_stats')
    CREATE TABLE blank_question_stats (
      userId NVARCHAR(256) NOT NULL,
      id NVARCHAR(128) NOT NULL,
      data NVARCHAR(MAX) NOT NULL,
      lastUpdated BIGINT NOT NULL,
      PRIMARY KEY (userId, id)
    );
  `);
  blankTablesEnsured = true;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pool = await getPool();
    await ensureBlankTables(pool);

    // sync.ts のキー名（camelCase）に合わせる
    const tables = [
    { name: "words",          resultKey: "words",         key: "id" },
    { name: "word_stats",     resultKey: "wordStats",     key: "wordId" },
    { name: "fish",           resultKey: "fish",          key: "fishId" },
    { name: "encyclopedia",   resultKey: "encyclopedia",  key: "fishType" },
    { name: "study_sessions", resultKey: "studySessions", key: "sessionId" },
    { name: "gold_ledger",    resultKey: "goldLedger",    key: "entryId" },
    { name: "fish_history",   resultKey: "fishHistory",   key: "entryId" },
    { name: "blank_questions",      resultKey: "blankQuestions",     key: "id" },
    { name: "blank_question_stats", resultKey: "blankQuestionStats", key: "id" },
  ] as const;

  // 全テーブルを1リクエストにまとめて取得する。
  // 以前はテーブルごとに await していたため1回の同期でDBと10往復しており、
  // そのぶんDBが起きている時間（＝無料枠の消費）と待ち時間が伸びていた。
  // mssql は複数の SELECT を recordsets（結果セットの配列）として返すので、
  // クエリを並べた順にそのまま対応付けられる。user_status は最後に置く。
  const batched = await pool.request()
    .input("userId", userId)
    .query(
      [
        ...tables.map((t) => `SELECT data, lastUpdated FROM ${t.name} WHERE userId = @userId;`),
        `SELECT data, lastUpdated FROM user_status WHERE userId = @userId;`,
      ].join("\n")
    );
  const recordsets = batched.recordsets as { data: string; lastUpdated: number }[][];

  const result: Record<string, unknown[] | unknown> = {};
  // 壊れた行が1件でもあると JSON.parse が投げて復元そのものが失敗し、
  // 「1件のせいで全部戻せない」状態になる。壊れた行だけ捨てて残りは必ず復元する。
  let brokenRows = 0;
  const parseRows = (tableName: string, rows: { data: string; lastUpdated: number }[] = []) =>
    rows.flatMap((r) => {
      try {
        return [{ ...JSON.parse(r.data), lastUpdated: r.lastUpdated }];
      } catch {
        brokenRows++;
        console.error(`[Sync] pull: ${tableName} の壊れた行を1件スキップしました`);
        return [];
      }
    });

  tables.forEach((t, i) => {
    result[t.resultKey] = parseRows(t.name, recordsets[i]);
  });

  const sr = recordsets[tables.length]?.[0];
  // userStatus が壊れている場合も、他のデータの復元は続行させる（null 扱い）
  let userStatus: unknown = null;
  if (sr) {
    try {
      userStatus = { ...JSON.parse(sr.data), lastUpdated: sr.lastUpdated };
    } catch {
      brokenRows++;
      console.error("[Sync] pull: user_status が壊れているためスキップしました");
    }
  }
  result.userStatus = userStatus;
  result.brokenRows = brokenRows;

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[Sync] pull failed:", err);
    // 接続が壊れている系のエラーのときだけプールを捨てる。
    // 全エラーで捨てると、コールドスタート由来のクエリタイムアウトのたびに
    // 温まったばかりの接続を張り直すことになり、DBを起こす回数が増えてしまう。
    if (isConnectionError(err)) resetPool();
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
