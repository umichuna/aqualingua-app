import pyodbc

connection_string = "Driver={ODBC Driver 17 for SQL Server};Server=aqualingua-db.database.windows.net;Database=master;Uid=chandoichi@sukonokuni.onmicrosoft.com;Pwd=Diver717;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"

try:
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()

    # ログイン作成
    cursor.execute("CREATE LOGIN aqualingua_user WITH PASSWORD = 'AquaLingua2026!';")
    conn.commit()
    print("✓ ログイン作成完了")

    cursor.close()
    conn.close()

    # DB 切り替え
    connection_string2 = connection_string.replace("Database=master", "Database=free-sql-db-2279904")
    conn2 = pyodbc.connect(connection_string2)
    cursor2 = conn2.cursor()

    # ユーザー作成と権限付与
    cursor2.execute("CREATE USER aqualingua_user FOR LOGIN aqualingua_user;")
    cursor2.execute("ALTER ROLE db_datareader ADD MEMBER aqualingua_user;")
    cursor2.execute("ALTER ROLE db_datawriter ADD MEMBER aqualingua_user;")
    cursor2.execute("ALTER ROLE db_ddladmin ADD MEMBER aqualingua_user;")
    conn2.commit()
    print("✓ ユーザー作成・権限付与完了")

    cursor2.close()
    conn2.close()

except Exception as e:
    print(f"✗ エラー: {e}")
