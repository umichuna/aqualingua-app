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
  blankQuestions?: Row[];
  blankQuestionStats?: Row[];
};

// 穴抜け問題のテーブルは後から追加したため、無ければ自動作成する
// （非エンジニアでも Azure で手作業せずに動くように）
async function ensureBlankTables(pool: sql.ConnectionPool) {
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
}

// sql.Request のコンストラクタは ConnectionPool | Transaction のユニオン型を
// そのまま受け付けるオーバーロードが無いため、instanceof で分岐して呼び分ける
function makeRequest(executor: sql.ConnectionPool | sql.Transaction): sql.Request {
  if (executor instanceof sql.Transaction) return new sql.Request(executor);
  return new sql.Request(executor);
}

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
// tx を渡した場合はトランザクション内で実行（push 全体をアトミックにするため）
async function mergeTable(
  executor: sql.ConnectionPool | sql.Transaction,
  userId: string,
  table: string,
  keyCol: string,
  rows: Row[]
) {
  if (!rows?.length) return;
  await makeRequest(executor)
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
      WHEN MATCHED AND s.lastUpdated >= t.lastUpdated THEN
        UPDATE SET data = s.data, lastUpdated = s.lastUpdated
      WHEN NOT MATCHED THEN
        INSERT (userId, ${keyCol}, data, lastUpdated)
        VALUES (s.userId, s.${keyCol}, s.data, s.lastUpdated);
    `);
}

// DELETE → 一括 INSERT（削除済みが残らないようにする words / fish / blank_questions 用）
async function replaceTable(
  executor: sql.ConnectionPool | sql.Transaction,
  userId: string,
  table: string,
  keyCol: string,
  rows: Row[]
) {
  await makeRequest(executor).input("userId", userId).query(`DELETE FROM ${table} WHERE userId = @userId`);
  if (!rows?.length) return;
  await makeRequest(executor)
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
    // テーブル作成はDDLのため、トランザクション開始前に済ませる
    await ensureBlankTables(pool);

    // push 全体を1トランザクションに包む: Azure SQL のコールドスタート等で
    // 途中のテーブルだけ書けて残りが失敗すると「Gだけ消費され、実績・拡張・メモは
    // 巻き戻る」というデータ不整合が起きるため、全部成功 or 全部ロールバックにする。
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let userStatusStale = false;
    try {
      // words / fish / blank_questions は clear+rewrite（削除した分がクラウドに残り続けるのを防ぐ）
      await replaceTable(transaction, userId, "words", "id", body.words ?? []);
      await replaceTable(transaction, userId, "fish", "fishId", body.fish ?? []);
      await replaceTable(transaction, userId, "blank_questions", "id", body.blankQuestions ?? []);

      // 他テーブルは LWW 条件付き MERGE
      await mergeTable(transaction, userId, "word_stats", "wordId", body.wordStats ?? []);
      await mergeTable(transaction, userId, "encyclopedia", "fishType", body.encyclopedia ?? []);
      await mergeTable(transaction, userId, "study_sessions", "sessionId", body.studySessions ?? []);
      await mergeTable(transaction, userId, "gold_ledger", "entryId", body.goldLedger ?? []);
      await mergeTable(transaction, userId, "fish_history", "entryId", body.fishHistory ?? []);
      await mergeTable(transaction, userId, "blank_question_stats", "id", body.blankQuestionStats ?? []);

      if (body.userStatus) {
        const us = body.userStatus;
        const lastUpdated = typeof us.lastUpdated === "number" ? us.lastUpdated : 0;
        const result = await new sql.Request(transaction)
          .input("userId", userId)
          .input("data", JSON.stringify(us))
          .input("lastUpdated", lastUpdated)
          .query(`
            MERGE user_status AS t
            USING (SELECT @userId AS userId) AS s ON t.userId = s.userId
            WHEN MATCHED AND @lastUpdated >= t.lastUpdated THEN
              UPDATE SET data = @data, lastUpdated = @lastUpdated
            WHEN NOT MATCHED THEN
              INSERT (userId, data, lastUpdated) VALUES (@userId, @data, @lastUpdated)
            OUTPUT $action AS action;
          `);
        // クラウド側の方が新しく、今回の userStatus 書き込みがスキップされた場合を検出
        // （古い端末が後からセーブして新しいクラウドデータを黙って潰すのを防ぐ）
        userStatusStale = result.recordset.length === 0;
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    return NextResponse.json({ ok: true, userStatusStale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[Sync] push failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
