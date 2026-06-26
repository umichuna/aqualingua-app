-- AquaLingua 全員共有のカスタム魚テーブル
-- userId を持たない（＝全ユーザー共通）。誰かが追加すると全員のガチャ・図鑑に出る。
-- ※ アプリ側 /api/custom-fish が初回アクセス時に自動作成するため、
--   手動で実行しなくても動作するが、明示的に作りたい場合はこれを1回実行する。

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'shared_custom_fish')
CREATE TABLE shared_custom_fish (
  fishType  NVARCHAR(128) PRIMARY KEY, -- 種類名（全体で一意）
  data      NVARCHAR(MAX) NOT NULL,    -- CustomFishDef の JSON
  createdBy NVARCHAR(256) NOT NULL,    -- 追加したユーザー（email/id）
  createdAt BIGINT        NOT NULL     -- 追加時刻（epoch ms）
);
