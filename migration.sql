-- AquaLingua クラウド同期テーブル
-- Azure Portal のクエリエディタで1回だけ実行してください

CREATE TABLE users (
  id NVARCHAR(256) PRIMARY KEY,
  email NVARCHAR(256) NOT NULL,
  createdAt DATETIME2 DEFAULT GETDATE()
);

CREATE TABLE words (
  userId NVARCHAR(256) NOT NULL,
  id NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, id)
);

CREATE TABLE word_stats (
  userId NVARCHAR(256) NOT NULL,
  wordId NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, wordId)
);

CREATE TABLE user_status (
  userId NVARCHAR(256) PRIMARY KEY,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL
);

CREATE TABLE fish (
  userId NVARCHAR(256) NOT NULL,
  fishId NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, fishId)
);

CREATE TABLE companions (
  userId NVARCHAR(256) NOT NULL,
  fishId NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, fishId)
);

CREATE TABLE encyclopedia (
  userId NVARCHAR(256) NOT NULL,
  fishType NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, fishType)
);

CREATE TABLE study_sessions (
  userId NVARCHAR(256) NOT NULL,
  sessionId NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, sessionId)
);

CREATE TABLE gold_ledger (
  userId NVARCHAR(256) NOT NULL,
  entryId NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, entryId)
);

CREATE TABLE fish_history (
  userId NVARCHAR(256) NOT NULL,
  entryId NVARCHAR(128) NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  lastUpdated BIGINT NOT NULL,
  PRIMARY KEY (userId, entryId)
);
