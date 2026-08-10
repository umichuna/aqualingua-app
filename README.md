# AquaLingua（アクアリンガ）

英単語学習と水槽（アクアリウム）育成を組み合わせた個人用の学習 PWA。
「しごと」（クイズ）でゴールドを稼ぎ、ショップのガチャでおさかなを集めて水槽を育てる。

## 画面

| 画面 | 内容 |
|------|------|
| 🐠 水槽 | おさかなの世話（餌やり・好感度）、水槽の切り替え・背景変更 |
| 💼 しごと | 自己採点 / 選択肢 / 聞き流し の3モード ＋ 穴抜けクイズ。ジャンル・レベル・種別・苦手優先などで出題を絞り込む |
| 📚 単語帳 | 単語（単語 / 述語 / 会話文）の登録・編集、CSV の書き出し／読み込み、AI翻訳・AI例文生成 |
| 📊 記録 | しごとの履歴とゴールドの通帳 |
| 📕 図鑑 | 発見したおさかなの一覧。管理者の合言葉で編集も可能 |
| 🏆 実績 | 達成した実績と、報酬おさかなの受け取り |
| 🛒 ショップ | 海水／淡水ガチャ、水槽・ボックスの拡張キット |
| 🔧 管理者 | 図鑑へのおさかな追加（`?view=admin` でも開ける） |

## 技術構成

- **Next.js 16（App Router）** / React 19 / TypeScript / Tailwind CSS 4
- **データはローカル第一**: 本体の状態は IndexedDB（`idb`、`DB_VERSION = 7`）に保存する。
  ストアは `userStatus` / `words` / `wordStats` / `aquarium` / `encyclopedia` /
  `studySessions` / `goldLedger` / `fishHistory` / `blankQuestions` /
  `blankQuestionStats` / `fishOverrides` / `sharedCustomFish` / `companions`
- **クラウド同期は手動のみ**（Azure SQL / `mssql`）。自動同期は意図的に無効にしてある
  （サーバーレス DB の無料枠は「起きている時間」で課金されるため、DB を起こす回数を抑える方針）
  - ☁️同期 = クラウドから復元（pull）
  - 💾セーブ = クラウドへ保存（push）
- **認証**: NextAuth（Google ログイン）
- **外部 API**: Azure Translator（AI翻訳）/ Gemini（AI例文生成）/ Google Cloud TTS（読み上げ）
- **PWA**: `public/sw.js`（キャッシュ名 `aqualingua-v4`）と `public/manifest.json`

## 開発

```bash
npm install
npm run dev     # 開発サーバー（http://localhost:3000）
npm run build   # 本番ビルド（TypeScript の型チェックを含む）
npm run start   # ビルド済みの本番サーバー
npm run lint    # ESLint（error 0 / warning 0 を維持する）
```

### ⚠️ 直したのに反映されないときは Service Worker を疑う

このアプリは PWA なので、ブラウザに登録済みの Service Worker が古いキャッシュを返し続けて、
**コードを直しても `npm run dev` を再起動しても表示が変わらない**ことがある。
開発者ツールで Service Worker の登録解除＋キャッシュ削除をするか、シークレットウィンドウで確認する。

## 環境変数

`.env.local`（コミットしない）と Vercel の環境変数に以下を設定する。**名前だけを載せる。値は書かない。**

| 変数名 | 用途 |
|--------|------|
| `AZURE_SQL_SERVER` / `AZURE_SQL_DATABASE` / `AZURE_SQL_USER` / `AZURE_SQL_PASSWORD` | クラウド同期先の Azure SQL |
| `NEXTAUTH_SECRET` | NextAuth のセッション暗号化 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google ログイン |
| `AZURE_TRANSLATOR_KEY` / `AZURE_TRANSLATOR_REGION` / `AZURE_TRANSLATOR_ENDPOINT` | AI翻訳 |
| `GEMINI_API_KEY` | AI例文生成 |
| `GOOGLE_TTS_API_KEY` | 聞き流しモードの読み上げ。失敗・未設定時はブラウザ内蔵の音声にフォールバックする |

未設定の API は該当機能だけが使えなくなる（アプリ自体は起動する）。
なお聞き流し以外の🔊読み上げは、もともとブラウザ内蔵の音声（`src/lib/speech.ts`）を使っている。

## ディレクトリ

```
src/app/          ページ（page.tsx / layout.tsx）と API ルート
  api/sync/       クラウド同期（pull / push）
  api/translate/  AI翻訳（Azure Translator）
  api/generate-examples/  AI例文生成（Gemini）
  api/tts/        読み上げ（Google Cloud TTS）
  api/custom-fish/, api/fish-overrides/  カスタム魚・組み込み魚の見た目の共有
src/components/   画面ごとのコンポーネント。GameProvider.tsx が全体の状態を持つ
src/lib/          db.ts（IndexedDB）, sync.ts（同期）, gameLogic.ts（ゴールド・価格・苦手判定）,
                  csv.ts（CSV 入出力）, types.ts, azure-sql.ts, speech.ts, tts.ts, sound.ts
src/data/         おさかなマスタ・実績・称号・サンプル単語
docs/             QAテスト仕様書
migration*.sql    Azure SQL のテーブル定義
```

## そのほかのドキュメント

- **`AGENTS.md`** — このリポジトリで作業するときの必読事項
- **`STATUS_REPORT.md`** — 経緯・修正履歴・原因・未解決事項の記録（最新が一番上）
- **`docs/QAテスト仕様書.md`** — 手動テストの項目
- **`VERIFICATION_CHECKLIST.md`** — Phase 13 の修正に対する動作確認チェックリスト（当時の作業記録）
