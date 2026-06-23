const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');

(async () => {
  console.log('🔧 Azure SQL ユーザー作成（Azure AD 認証）\n');

  try {
    // Step 1: Azure AD トークン取得
    console.log('📍 ステップ1: Azure AD トークン取得');
    const credential = new DefaultAzureCredential();
    const token = await credential.getToken('https://database.windows.net/.default');
    console.log('✅ トークン取得成功\n');

    // Step 2: マスターDBでログイン作成
    console.log('📍 ステップ2: マスターDB接続 → ログイン作成');
    const adminConfig = {
      server: 'aqualingua-db.database.windows.net',
      database: 'master',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: token.token
        }
      },
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    };

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
      CREATE LOGIN [aqualingua_user] WITH PASSWORD = 'Aqu@Lingua2026!Sync';
    `);
    console.log('✅ ログイン作成完了\n');

    await adminPool.close();

    // Step 3: 対象DB接続 → ユーザー作成 & 権限付与
    console.log('📍 ステップ3: 対象DB接続 → ユーザー作成');
    const dbConfig = {
      server: 'aqualingua-db.database.windows.net',
      database: 'free-sql-db-2279904',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: token.token
        }
      },
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    };

    const dbPool = new sql.ConnectionPool(dbConfig);
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
    console.log('🎉 これで接続テストが成功します\n');

  } catch (error) {
    console.error('\n❌ エラー:');
    console.error(`   ${error.message}\n`);
    console.error('詳細:');
    console.error(error);
  }
})();
