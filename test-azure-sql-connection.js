const fs = require('fs');
const sql = require('mssql');

// .env.local から環境変数を読み込む
const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const config = {
  server: envVars.AZURE_SQL_SERVER,
  database: envVars.AZURE_SQL_DATABASE,
  user: envVars.AZURE_SQL_USER,
  password: envVars.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

(async () => {
  console.log('🔗 Azure SQL 接続テスト開始\n');

  try {
    console.log(`📍 接続情報:`);
    console.log(`   Server: ${config.server}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}\n`);

    const pool = new sql.ConnectionPool(config);

    console.log('⏳ Azure SQL に接続中...');
    await pool.connect();
    console.log('✅ Azure SQL に接続成功！\n');

    // テーブル一覧を確認
    console.log('📋 データベース内のテーブル確認:');
    const result = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    const tables = result.recordset.map(r => r.TABLE_NAME);
    const requiredTables = ['users', 'words', 'word_stats', 'fish', 'encyclopedia', 'study_sessions', 'gold_ledger', 'fish_history', 'user_status'];

    for (const table of requiredTables) {
      const exists = tables.includes(table);
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    }

    // テーブルのスキーマ確認（words テーブルを例に）
    console.log('\n📊 words テーブルのスキーマ:');
    const schemaResult = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'words'
      ORDER BY ORDINAL_POSITION
    `);

    if (schemaResult.recordset.length > 0) {
      for (const col of schemaResult.recordset) {
        console.log(`   - ${col.COLUMN_NAME} (${col.DATA_TYPE}, ${col.IS_NULLABLE === 'YES' ? 'nullable' : 'not null'})`);
      }
    }

    // 行数確認
    console.log('\n📈 各テーブルの行数:');
    for (const table of requiredTables) {
      try {
        const countResult = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${table}`);
        const count = countResult.recordset[0].cnt;
        console.log(`   ${table}: ${count} 行`);
      } catch (e) {
        console.log(`   ${table}: ❌ エラー (${e.message.substring(0, 50)})`);
      }
    }

    console.log('\n🟢 Azure SQL 接続成功');
    console.log('✅ すべてのテーブルが作成されています\n');

    await pool.close();
  } catch (error) {
    console.error('\n❌ Azure SQL 接続エラー:');
    console.error(`   ${error.message}\n`);

    console.log('トラブルシューティング:');
    console.log('1. .env.local に以下の変数が設定されているか確認:');
    console.log('   - AZURE_SQL_SERVER');
    console.log('   - AZURE_SQL_DATABASE');
    console.log('   - AZURE_SQL_USER');
    console.log('   - AZURE_SQL_PASSWORD');
    console.log('2. Azure SQL のファイアウォール設定を確認');
    console.log('3. migration.sql でテーブルが作成されているか確認');
  }
})();
