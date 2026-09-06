import sql from "mssql";

const config: sql.config = {
  server: process.env.AZURE_SQL_SERVER!,
  database: process.env.AZURE_SQL_DATABASE!,
  authentication: {
    type: "default",
    options: {
      userName: process.env.AZURE_SQL_USER!,
      password: process.env.AZURE_SQL_PASSWORD!,
    },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  // 無料DBが一時停止から復帰する間の待ち時間を確保
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

let pool: sql.ConnectionPool | null = null;

/**
 * 接続プールを捨てる。
 * mssql の close() は内部で globalConnection を同期的に null に戻すため、
 * close の完了を待たなくても次の sql.connect() は新しいプールを作る。
 *
 * close を await しないのは意図的。tarn の destroy() は使用中の接続が返却されるまで
 * 待つため、await すると別リクエストのトランザクション完了まで自分の応答が止まり、
 * Vercel の maxDuration を超えかねない。
 */
export function resetPool(): void {
  const old = pool;
  pool = null;
  if (!old) return;
  void old.close().catch(() => {
    // 既に壊れているプールの close は失敗し得るが、捨てるのが目的なので無視する
  });
}

/**
 * 接続そのものが壊れている系のエラーか。
 * SQL の内容エラー（値が長すぎる・PK重複など）やクエリタイムアウトでプールを捨てると、
 * 温まったばかりの接続を毎回張り直すことになり、「DBを起こす回数を減らす」方針に反する。
 * プールを作り直す価値があるのは、認証やソケットが壊れているときだけ。
 */
export function isConnectionError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    ["ELOGIN", "ESOCKET", "ECONNCLOSED", "ENOTOPEN", "ECONNRESET"].includes(code)
  );
}

export async function getPool(): Promise<sql.ConnectionPool> {
  // connected だけでは不十分。mssql の _connected は一度 true になると close() する
  // まで false に戻らないため、パスワード変更・DBの自動一時停止・フェイルオーバーで
  // 実接続が張れなくなっても connected は true のまま居座る。
  // 実際に接続を作れているかは healthy が持っているので、両方を見る。
  // （これを見ないと、一度壊れたプールをこのインスタンスが生きている間ずっと
  //   使い続けてしまい、再デプロイするまで同期が復旧しない）
  if (pool && pool.connected && pool.healthy) return pool;
  // 壊れたプールが残っているなら捨ててから作り直す
  resetPool();
  try {
    pool = await sql.connect(config);
    return pool;
  } catch (err) {
    // 接続失敗時は次回再接続できるようにリセット
    pool = null;
    throw err;
  }
}
