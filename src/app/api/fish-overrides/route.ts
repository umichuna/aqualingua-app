import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool } from "@/lib/azure-sql";
import sql from "mssql";

export const maxDuration = 60;

// 組み込み魚の編集内容（FishOverride）を全ユーザー共有するテーブル。
// 誰かが魚の名前・画像・サイズ等を変更すると全員に反映される。

async function ensureTable(pool: sql.ConnectionPool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'fish_overrides')
    CREATE TABLE fish_overrides (
      fishType    NVARCHAR(128) PRIMARY KEY,
      data        NVARCHAR(MAX) NOT NULL,
      lastUpdated BIGINT        NOT NULL
    );
  `);
}

function getUserId(session: Awaited<ReturnType<typeof getServerSession>>): string | null {
  const s = session as { user?: { id?: string; email?: string } } | null;
  return s?.user?.id ?? s?.user?.email ?? null;
}

// GET: 全件返す（ログイン必須）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!getUserId(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const pool = await getPool();
    await ensureTable(pool);
    const res = await pool.request().query(`SELECT data FROM fish_overrides`);
    const overrides = res.recordset.map((r: { data: string }) => JSON.parse(r.data));
    return NextResponse.json({ overrides });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[FishOverrides] GET failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: 追加/更新（ログイン必須）。body = FishOverride
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!getUserId(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const override = await req.json();
    const fishType = typeof override?.type === "string" ? override.type.trim() : "";
    if (!fishType) return NextResponse.json({ error: "type is required" }, { status: 400 });

    const pool = await getPool();
    await ensureTable(pool);
    await pool
      .request()
      .input("fishType", fishType)
      .input("data", JSON.stringify(override))
      .input("lastUpdated", Date.now())
      .query(`
        MERGE fish_overrides AS t
        USING (SELECT @fishType AS fishType) AS s ON t.fishType = s.fishType
        WHEN MATCHED THEN
          UPDATE SET data = @data, lastUpdated = @lastUpdated
        WHEN NOT MATCHED THEN
          INSERT (fishType, data, lastUpdated)
          VALUES (@fishType, @data, @lastUpdated);
      `);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[FishOverrides] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: 削除（ログイン必須）。body = { fishType }
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
      .query(`DELETE FROM fish_overrides WHERE fishType = @fishType`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[FishOverrides] DELETE failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
