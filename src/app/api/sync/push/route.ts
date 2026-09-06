import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, isConnectionError, resetPool } from "@/lib/azure-sql";
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
  // 「手元が空なのは意図的だ」とユーザーが確認したうえでの再送。
  // これが無い限り、クラウドに行が残っているテーブルを空で上書きすることはしない。
  allowEmpty?: boolean;
};

// 穴抜け問題のテーブルは後から追加したため、無ければ自動作成する
// （非エンジニアでも Azure で手作業せずに動くように）
// サーバーインスタンスごとに1回確認すれば十分なので、フラグで毎回の実行を避ける
// （同期のたびのテーブル存在確認クエリはDB無料枠の無駄遣いになるため）
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

// sql.Request のコンストラクタは ConnectionPool | Transaction のユニオン型を
// そのまま受け付けるオーバーロードが無いため型アサーションで型検査を通す
// （mssql の Request は実行時の型で pool/transaction を判別するため、この
//  アサーションは実際の分岐を変えない・安全）
function makeRequest(executor: sql.ConnectionPool | sql.Transaction): sql.Request {
  return new sql.Request(executor as sql.ConnectionPool);
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
//
// 手元が空なのにクラウドには行が残っている場合、黙って消さずにスキップする。
// 新しい端末でログインして復元前に 💾セーブ すると、DELETE だけが走ってクラウドの
// データが丸ごと消えるため（userStatus は新旧比較で守られているのに、この3テーブルだけ
// 無防備だった）。
//
// 以前は「未同期の新端末（userStatus.lastUpdated === 0）」に限ってスキップしていたが、
// 新端末でも設定変更やクイズを1回でも行うと lastUpdated が入って判定から外れるため、
// 「新端末でログイン → 1回遊ぶ → 復元せずに保存」で警告なくクラウドが消えていた。
//
// かといって「空なら常にスキップ」も誤りで、以前その方式で
//  - 魚を全部ボックスへ移すと fish が空になり、スキップの結果クラウドに古い行が残って
//    復元時に同じ魚が水槽とボックスに二重化する
//  - 端末Aで全部削除しても、スキップにより他端末へ削除が伝播しない
// という別の不具合を生んでいた。
//
// そこで「意図的に空にしたのか」をユーザー本人に確認する。既定では消さずにスキップして
// 呼び出し元に知らせ、了承を得た再送（allowEmpty）でのみ実際に空へ置き換える。
// @returns true = 消さずにスキップした
async function replaceTable(
  executor: sql.ConnectionPool | sql.Transaction,
  userId: string,
  table: string,
  keyCol: string,
  rows: Row[],
  allowEmpty: boolean
): Promise<boolean> {
  if (!rows?.length && !allowEmpty) {
    // 存在確認だけなので COUNT(*) でパーティション全体を走査・ロックしない
    const existing = await makeRequest(executor)
      .input("userId", userId)
      .query(`SELECT TOP 1 1 AS c FROM ${table} WHERE userId = @userId`);
    // クラウドに残っているのに手元が空 = 復元前の保存の可能性があるので触らない
    if (existing.recordset.length > 0) return true;
  }
  await makeRequest(executor).input("userId", userId).query(`DELETE FROM ${table} WHERE userId = @userId`);
  if (!rows?.length) return false;
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
  return false;
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
    const skippedEmptyTables: string[] = [];
    try {
      // words / fish / blank_questions は clear+rewrite（削除した分がクラウドに残り続けるのを防ぐ）
      // 手元が空でクラウドに行が残っている場合は消さずスキップし、呼び出し元に知らせる。
      // ユーザーが「意図的に空にした」と確認した再送（allowEmpty）でのみ実際に置き換える。
      const allowEmpty = body.allowEmpty === true;
      if (await replaceTable(transaction, userId, "words", "id", body.words ?? [], allowEmpty)) {
        skippedEmptyTables.push("words");
      }
      if (await replaceTable(transaction, userId, "fish", "fishId", body.fish ?? [], allowEmpty)) {
        skippedEmptyTables.push("fish");
      }
      if (await replaceTable(transaction, userId, "blank_questions", "id", body.blankQuestions ?? [], allowEmpty)) {
        skippedEmptyTables.push("blankQuestions");
      }

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
      // rollback 自体が失敗しても元のエラーを握りつぶさない
      // （プールが壊れているときは rollback も失敗し、原因が追えなくなる）
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error("[Sync] rollback failed:", rollbackErr);
      }
      throw err;
    }

    return NextResponse.json({ ok: true, userStatusStale, skippedEmptyTables });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[Sync] push failed:", err);
    // 接続が壊れている系のエラーのときだけプールを捨てる。
    // 全エラーで捨てると、コールドスタート由来のクエリタイムアウトのたびに
    // 温まったばかりの接続を張り直すことになり、DBを起こす回数が増えてしまう。
    if (isConnectionError(err)) resetPool();
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
