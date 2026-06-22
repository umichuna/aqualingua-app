import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool } from "@/lib/azure-sql";
import sql from "mssql";

// Vercel のサーバー実行時間上限を延長（許可プランで有効。非対応でも無害）
export const maxDuration = 60;

// クライアントは「フル オブジェクトの配列」を送ってくる（例: Word[]）。
// data 列にはオブジェクト全体を JSON で保存する。
type Row = Record<string, unknown> & { lastUpdated?: number };

type PushPayload = {
  words?: Row[];
  wordStats?: Row[];
  userStatus?: Row | null;
  fish?: Row[];
  encyclopedia?: Row[];
  studySessions?: Row[];
  goldLedger?: Row[];
  fishHistory?: Row[];
};

// 各行を { key, data(オブジェクト全体), lastUpdated } に整形して JSON 文字列にする
function buildRowsJson(rows: Row[], keyCol: string): string {
  return JSON.stringify(
    rows.map((r) => ({
      key: String(r[keyCol] ?? ""),
      data: r,
      lastUpdated: typeof r.lastUpdated === "number" ? r.lastUpdated : 0,
    }))
  );
}

// LWW 条件付きの一括 MERGE（テーブル1つにつきクエリ1回）
async function mergeTable(
  pool: sql.ConnectionPool,
  userId: string,
  table: string,
  keyCol: string,
  rows: Row[]
) {
  if (!rows?.length) return;
  await pool
    .request()
    .input("userId", userId)
    .input("rows", buildRowsJson(rows, keyCol))
    .query(`
      MERGE ${table} AS t
      USING (
        SELECT @userId AS userId, j.[key] AS ${keyCol}, j.data AS data, j.lastUpdated AS lastUpdated
        FROM OPENJSON(@rows) WITH (
          [key]       NVARCHAR(128) '$.key',
          data        NVARCHAR(MAX) '$.data' AS JSON,
          lastUpdated BIGINT        '$.lastUpdated'
        ) j
      ) AS s
        ON t.userId = s.userId AND t.${keyCol} = s.${keyCol}
      WHEN MATCHED THEN
        UPDATE SET data = s.data, lastUpdated = s.lastUpdated
      WHEN NOT MATCHED THEN
        INSERT (userId, ${keyCol}, data, lastUpdated)
        VALUES (s.userId, s.${keyCol}, s.data, s.lastUpdated);
    `);
}

// DELETE → 一括 INSERT（削除済みが残らないようにする words / fish 用）
async function replaceTable(
  pool: sql.ConnectionPool,
  userId: string,
  table: string,
  keyCol: string,
  rows: Row[]
) {
  await pool.request().input("userId", userId).query(`DELETE FROM ${table} WHERE userId = @userId`);
  if (!rows?.length) return;
  await pool
    .request()
    .input("userId", userId)
    .input("rows", buildRowsJson(rows, keyCol))
    .query(`
      INSERT INTO ${table} (userId, ${keyCol}, data, lastUpdated)
      SELECT @userId, j.[key], j.data, j.lastUpdated
      FROM OPENJSON(@rows) WITH (
        [key]       NVARCHAR(128) '$.key',
        data        NVARCHAR(MAX) '$.data' AS JSON,
        lastUpdated BIGINT        '$.lastUpdated'
      ) j;
    `);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: PushPayload = await req.json();
    const pool = await getPool();

    // words / fish は clear+rewrite（削除した分がクラウドに残り続けるのを防ぐ）
    await replaceTable(pool, userId, "words", "id", body.words ?? []);
    await replaceTable(pool, userId, "fish", "fishId", body.fish ?? []);

    // 他テーブルは LWW 条件付き MERGE
    await mergeTable(pool, userId, "word_stats", "wordId", body.wordStats ?? []);
    await mergeTable(pool, userId, "encyclopedia", "fishType", body.encyclopedia ?? []);
    await mergeTable(pool, userId, "study_sessions", "sessionId", body.studySessions ?? []);
    await mergeTable(pool, userId, "gold_ledger", "entryId", body.goldLedger ?? []);
    await mergeTable(pool, userId, "fish_history", "entryId", body.fishHistory ?? []);

    if (body.userStatus) {
      const us = body.userStatus;
      await pool
        .request()
        .input("userId", userId)
        .input("data", JSON.stringify(us))
        .input("lastUpdated", typeof us.lastUpdated === "number" ? us.lastUpdated : 0)
        .query(`
          MERGE user_status AS t
          USING (SELECT @userId AS userId) AS s ON t.userId = s.userId
          WHEN MATCHED THEN
            UPDATE SET data = @data, lastUpdated = @lastUpdated
          WHEN NOT MATCHED THEN
            INSERT (userId, data, lastUpdated) VALUES (@userId, @data, @lastUpdated);
        `);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[Sync] push failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
