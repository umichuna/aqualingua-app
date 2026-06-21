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

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  try {
    pool = await sql.connect(config);
    return pool;
  } catch (err) {
    // 接続失敗時は次回再接続できるようにリセット
    pool = null;
    throw err;
  }
}
