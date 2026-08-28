/**
 * Azure SQL のアプリ用ユーザー（aqualingua_user）を作成・修復・パスワード再設定するスクリプト。
 *
 * 【重要】このファイルにパスワードを直接書かないこと。
 * 認証は Azure AD（`az login` 済みのアカウント）を使うので、管理者パスワードは不要。
 *
 * 使い方（PowerShell / Bash 共通）:
 *   az login                          # 先にAzureにログイン（初回のみ）
 *   node setup-db-user.js ensure      # ログイン+ユーザー+権限を確認し、無ければ作る
 *   node setup-db-user.js reset-password <新しいパスワード>
 *
 * 実行後は .env.local と Vercel の環境変数 AZURE_SQL_PASSWORD も忘れず更新すること。
 */
const sql = require("mssql");
const { DefaultAzureCredential } = require("@azure/identity");

const SERVER = process.env.AZURE_SQL_SERVER || "aqualingua-db.database.windows.net";
const DATABASE = process.env.AZURE_SQL_DATABASE || "free-sql-db-2279904";
const APP_USER = process.env.AZURE_SQL_USER || "aqualingua_user";

async function connect(token, database) {
  return sql.connect({
    server: SERVER,
    database,
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
    options: { encrypt: true, trustServerCertificate: false },
    connectionTimeout: 60000,
    requestTimeout: 60000,
  });
}

// SQL の文字列リテラルに安全に埋め込む（' を '' にエスケープ）。
// 識別子ではなくパスワード文字列にのみ使う。
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const command = process.argv[2];
  const newPassword = process.argv[3];

  if (!command || !["ensure", "reset-password"].includes(command)) {
    console.error("使い方: node setup-db-user.js ensure | reset-password <新しいパスワード>");
    process.exit(1);
  }
  if (command === "reset-password" && !newPassword) {
    console.error("使い方: node setup-db-user.js reset-password <新しいパスワード>");
    process.exit(1);
  }

  console.log("📍 Azure AD で認証中（az login 済みのアカウントを使用）...");
  const credential = new DefaultAzureCredential();
  const { token } = await credential.getToken("https://database.windows.net/.default");
  console.log("✅ 認証成功");

  // ---- サーバーレベル: ログインの確認・作成・パスワード変更 ----
  const master = await connect(token, "master");
  const loginRes = await master
    .request()
    .input("name", APP_USER)
    .query("SELECT name FROM sys.sql_logins WHERE name = @name");
  const loginExists = loginRes.recordset.length > 0;

  if (!loginExists) {
    if (!newPassword) {
      console.error(`❌ ログイン ${APP_USER} が存在しません。reset-password <パスワード> で作成してください。`);
      await master.close();
      process.exit(1);
    }
    await master.request().query(`CREATE LOGIN [${APP_USER}] WITH PASSWORD = ${quote(newPassword)};`);
    console.log(`✅ ログイン ${APP_USER} を作成しました`);
  } else if (command === "reset-password") {
    await master.request().query(`ALTER LOGIN [${APP_USER}] WITH PASSWORD = ${quote(newPassword)};`);
    console.log(`✅ ログイン ${APP_USER} のパスワードを変更しました`);
  } else {
    console.log(`✅ ログイン ${APP_USER} は既に存在します`);
  }
  await master.close();

  // ---- データベースレベル: ユーザーの確認・作成・権限付与 ----
  // ログインがあってもDB側のユーザーが無いと「Login failed」になるため、必ず両方を確認する。
  const db = await connect(token, DATABASE);
  const userRes = await db
    .request()
    .input("name", APP_USER)
    .query("SELECT name FROM sys.database_principals WHERE name = @name");

  if (userRes.recordset.length === 0) {
    await db.request().query(`CREATE USER [${APP_USER}] FOR LOGIN [${APP_USER}];`);
    console.log(`✅ データベースユーザー ${APP_USER} を作成しました`);
  } else {
    console.log(`✅ データベースユーザー ${APP_USER} は既に存在します`);
  }

  await db.request().query(`ALTER ROLE [db_owner] ADD MEMBER [${APP_USER}];`);
  console.log("✅ db_owner 権限を確認しました");
  await db.close();

  console.log("\n🟢 完了。.env.local と Vercel の AZURE_SQL_PASSWORD の更新を忘れずに。");
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
