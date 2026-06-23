const sql = require('mssql');

const config = {
  server: 'aqualingua-db.database.windows.net',
  database: 'master',
  authentication: {
    type: 'default',
    options: {
      userName: 'chandoichi@sukonokuni.onmicrosoft.com',
      password: 'Diver717'
    }
  },
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 }
};

async function setupUser() {
  const pool = new sql.ConnectionPool(config);
  try {
    await pool.connect();
    console.log('✓ master DB に接続');

    // ログイン作成
    await pool.request().query("CREATE LOGIN aqualingua_user WITH PASSWORD = 'AquaLingua2026!';");
    console.log('✓ ログイン作成完了');

    await pool.close();

    // DB を切り替えて接続
    const config2 = { ...config, database: 'free-sql-db-2279904' };
    const pool2 = new sql.ConnectionPool(config2);
    await pool2.connect();
    console.log('✓ free-sql-db-2279904 に接続');

    // ユーザー作成と権限付与
    await pool2.request().query("CREATE USER aqualingua_user FOR LOGIN aqualingua_user;");
    await pool2.request().query("ALTER ROLE db_datareader ADD MEMBER aqualingua_user;");
    await pool2.request().query("ALTER ROLE db_datawriter ADD MEMBER aqualingua_user;");
    await pool2.request().query("ALTER ROLE db_ddladmin ADD MEMBER aqualingua_user;");
    console.log('✓ ユーザー作成・権限付与完了');

    await pool2.close();
    console.log('✓ セットアップ完了！');
  } catch (err) {
    console.error('✗ エラー:', err.message);
  }
}

setupUser();
