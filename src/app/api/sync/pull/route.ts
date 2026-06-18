import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getPool } from "@/lib/azure-sql";

export async function GET() {
  const session = await getServerSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = await getPool();

  const tables = [
    { name: "words", key: "id" },
    { name: "word_stats", key: "wordId" },
    { name: "fish", key: "fishId" },
    { name: "encyclopedia", key: "fishType" },
    { name: "study_sessions", key: "sessionId" },
    { name: "gold_ledger", key: "entryId" },
    { name: "fish_history", key: "entryId" },
  ] as const;

  const result: Record<string, unknown[]> = {};

  for (const t of tables) {
    const res = await pool.request()
      .input("userId", userId)
      .query(`SELECT data, lastUpdated FROM ${t.name} WHERE userId = @userId`);
    result[t.name] = res.recordset.map((r: { data: string; lastUpdated: number }) => ({
      ...JSON.parse(r.data),
      lastUpdated: r.lastUpdated,
    }));
  }

  const statusRes = await pool.request()
    .input("userId", userId)
    .query(`SELECT data, lastUpdated FROM user_status WHERE userId = @userId`);
  const sr = statusRes.recordset[0] as { data: string; lastUpdated: number } | undefined;
  result.userStatus = sr
    ? { ...JSON.parse(sr.data), lastUpdated: sr.lastUpdated }
    : null;

  return NextResponse.json(result);
}
