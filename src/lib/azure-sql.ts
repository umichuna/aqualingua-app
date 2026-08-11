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
 * 接続プールを確実に破棄する。
 * mssql の close() は内部で globalConnection を null に戻すため、
 * 次の sql.connect() が新しいプールを作り直せるようになる。
 */
export async function resetPool(): Promise<void> {
  const old = pool;
  pool = null;
  if (!old) return;
  try {
    await old.close();
  } catch {
    // 既に壊れているプールの close は失敗し得るが、捨てるのが目的なので無視する
  }
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
  await resetPool();
  try {
    pool = await sql.connect(config);
    return pool;
  } catch (err) {
    // 接続失敗時は次回再接続できるようにリセット
    pool = null;
    throw err;
  }
}
