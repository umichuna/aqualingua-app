const sql = require('mssql');

const adminConfig = {
  server: 'aqualingua-db.database.windows.net',
  database: 'master',
  user: 'chandoichi@sukonokuni.onmicrosft.com',
  password: 'Diver717',
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

const targetConfig = {
  server: 'aqualingua-db.database.windows.net',
  database: 'free-sql-db-2279904',
  user: 'chandoichi@sukonokuni.onmicrosft.com',
  password: 'Diver717',
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

(async () => {
  console.log('🔧 Azure SQL ユーザー作成開始\n');

  try {
    // Step 1: マスターDBで管理者ログイン → ログイン作成
    console.log('📍 ステップ1: マスターDB接続 → ログイン作成');
    const adminPool = new sql.ConnectionPool(adminConfig);
    await adminPool.connect();
    console.log('✅ マスターDB接続成功');

    // DROP LOGIN if exists
    try {
      await adminPool.request().query(`
        IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'aqualingua_user')
        BEGIN
          DROP LOGIN [aqualingua_user];
        END
      `);
      console.log('   既存ログイン削除');
    } catch (e) {
      // ignore
    }

    // CREATE LOGIN
    await adminPool.request().query(`
      CREATE LOGIN [aqualingua_user] WITH PASSWORD = 'AquaLingua2026!';
    `);
    console.log('✅ ログイン作成完了\n');

    await adminPool.close();

    // Step 2: 対象DB接続 → ユーザー作成 & 権限付与
    console.log('📍 ステップ2: 対象DB接続 → ユーザー作成');
    const dbPool = new sql.ConnectionPool(targetConfig);
    await dbPool.connect();
    console.log('✅ 対象DB接続成功');

    // DROP USER if exists
    try {
      await dbPool.request().query(`
        IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'aqualingua_user')
        BEGIN
          DROP USER [aqualingua_user];
        END
      `);
      console.log('   既存ユーザー削除');
    } catch (e) {
      // ignore
    }

    // CREATE USER
    await dbPool.request().query(`
      CREATE USER [aqualingua_user] FOR LOGIN [aqualingua_user];
    `);
    console.log('✅ ユーザー作成完了');

    // ALTER ROLE
    await dbPool.request().query(`
      ALTER ROLE [db_owner] ADD MEMBER [aqualingua_user];
    `);
    console.log('✅ db_owner ロール付与完了\n');

    await dbPool.close();

    console.log('🟢 ユーザー作成完了！');
    console.log('   次: npm run dev でアプリを起動し、ローカルテストを実施してください\n');

  } catch (error) {
    console.error('\n❌ エラー:');
    console.error(`   ${error.message}\n`);
  }
})();
