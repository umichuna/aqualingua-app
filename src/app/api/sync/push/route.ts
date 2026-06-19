import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool } from "@/lib/azure-sql";
import sql from "mssql";

type PushPayload = {
  words?: { id: string; data: unknown; lastUpdated: number }[];
  wordStats?: { wordId: string; data: unknown; lastUpdated: number }[];
  userStatus?: { data: unknown; lastUpdated: number } | null;
  fish?: { fishId: string; data: unknown; lastUpdated: number }[];
  encyclopedia?: { fishType: string; data: unknown; lastUpdated: number }[];
  studySessions?: { sessionId: string; data: unknown; lastUpdated: number }[];
  goldLedger?: { entryId: string; data: unknown; lastUpdated: number }[];
  fishHistory?: { entryId: string; data: unknown; lastUpdated: number }[];
};

async function upsertRows(
  pool: sql.ConnectionPool,
  userId: string,
  table: string,
  keyCol: string,
  rows: { [key: string]: unknown; data: unknown; lastUpdated: number }[]
) {
  for (const row of rows) {
    const keyVal = row[keyCol] as string;
    await pool.request()
      .input("userId", userId)
      .input("key", keyVal)
      .input("data", JSON.stringify(row.data ?? row))
      .input("lastUpdated", row.lastUpdated)
      .query(`
        MERGE ${table} AS t
        USING (SELECT @userId AS userId, @key AS ${keyCol}) AS s
          ON t.userId = s.userId AND t.${keyCol} = s.${keyCol}
        WHEN MATCHED AND @lastUpdated > t.lastUpdated THEN
          UPDATE SET data = @data, lastUpdated = @lastUpdated
        WHEN NOT MATCHED THEN
          INSERT (userId, ${keyCol}, data, lastUpdated)
          VALUES (@userId, @key, @data, @lastUpdated);
      `);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: PushPayload = await req.json();
  const pool = await getPool();

  if (body.words?.length) await upsertRows(pool, userId, "words", "id", body.words.map(r => ({ ...r, data: r.data })));
  if (body.wordStats?.length) await upsertRows(pool, userId, "word_stats", "wordId", body.wordStats.map(r => ({ ...r, data: r.data })));
  if (body.fish?.length) await upsertRows(pool, userId, "fish", "fishId", body.fish.map(r => ({ ...r, data: r.data })));
  if (body.encyclopedia?.length) await upsertRows(pool, userId, "encyclopedia", "fishType", body.encyclopedia.map(r => ({ ...r, data: r.data })));
  if (body.studySessions?.length) await upsertRows(pool, userId, "study_sessions", "sessionId", body.studySessions.map(r => ({ ...r, data: r.data })));
  if (body.goldLedger?.length) await upsertRows(pool, userId, "gold_ledger", "entryId", body.goldLedger.map(r => ({ ...r, data: r.data })));
  if (body.fishHistory?.length) await upsertRows(pool, userId, "fish_history", "entryId", body.fishHistory.map(r => ({ ...r, data: r.data })));

  if (body.userStatus) {
    await pool.request()
      .input("userId", userId)
      .input("data", JSON.stringify(body.userStatus.data ?? body.userStatus))
      .input("lastUpdated", body.userStatus.lastUpdated)
      .query(`
        MERGE user_status AS t
        USING (SELECT @userId AS userId) AS s ON t.userId = s.userId
        WHEN MATCHED AND @lastUpdated > t.lastUpdated THEN
          UPDATE SET data = @data, lastUpdated = @lastUpdated
        WHEN NOT MATCHED THEN
          INSERT (userId, data, lastUpdated) VALUES (@userId, @data, @lastUpdated);
      `);
  }

  return NextResponse.json({ ok: true });
}
