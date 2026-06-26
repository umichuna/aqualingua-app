import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool } from "@/lib/azure-sql";
import sql from "mssql";

// 無料DBの復帰待ちに余裕を持たせる
export const maxDuration = 60;

// 全員共有のカスタム魚。userId を持たず、全ユーザーで共通のプールになる。
// 誰かが追加すると全員のガチャ・図鑑に出る。

// テーブルが無ければ作る（非エンジニアでも Azure で手作業せずに動くように）
async function ensureTable(pool: sql.ConnectionPool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'shared_custom_fish')
    CREATE TABLE shared_custom_fish (
      fishType  NVARCHAR(128) PRIMARY KEY,
      data      NVARCHAR(MAX) NOT NULL,
      createdBy NVARCHAR(256) NOT NULL,
      createdAt BIGINT        NOT NULL
    );
  `);
}

function getUserId(session: Awaited<ReturnType<typeof getServerSession>>): string | null {
  const s = session as { user?: { id?: string; email?: string } } | null;
  return s?.user?.id ?? s?.user?.email ?? null;
}

// GET: 共有カスタム魚を全件返す（ログイン必須）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!getUserId(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pool = await getPool();
    await ensureTable(pool);
    const res = await pool.request().query(`SELECT data FROM shared_custom_fish`);
    const fish = res.recordset.map((r: { data: string }) => JSON.parse(r.data));
    return NextResponse.json({ fish });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[CustomFish] GET failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: 共有カスタム魚を追加/更新（ログイン必須）。body = CustomFishDef
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const def = await req.json();
    const fishType = typeof def?.type === "string" ? def.type.trim() : "";
    if (!fishType) return NextResponse.json({ error: "type is required" }, { status: 400 });

    const pool = await getPool();
    await ensureTable(pool);
    await pool
      .request()
      .input("fishType", fishType)
      .input("data", JSON.stringify(def))
      .input("createdBy", userId)
      .input("createdAt", Date.now())
      .query(`
        MERGE shared_custom_fish AS t
        USING (SELECT @fishType AS fishType) AS s ON t.fishType = s.fishType
        WHEN MATCHED THEN
          UPDATE SET data = @data
        WHEN NOT MATCHED THEN
          INSERT (fishType, data, createdBy, createdAt)
          VALUES (@fishType, @data, @createdBy, @createdAt);
      `);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[CustomFish] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: 共有カスタム魚を削除（ログイン必須）。body = { fishType }
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!getUserId(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const fishType = typeof body?.fishType === "string" ? body.fishType.trim() : "";
    if (!fishType) return NextResponse.json({ error: "fishType is required" }, { status: 400 });

    const pool = await getPool();
    await ensureTable(pool);
    await pool
      .request()
      .input("fishType", fishType)
      .query(`DELETE FROM shared_custom_fish WHERE fishType = @fishType`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[CustomFish] DELETE failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
