"use client";

// メインアプリ（SPAビュースイッチャー）
// スタート画面（2秒で自動遷移） → ホーム画面
// 下部ナビ4タブ: ホーム / 水槽 / しごと / ショップ
// ホームから: 記録・単語帳・図鑑・設定 にもアクセスできる

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import AdminView from "@/components/AdminView";
import AquariumView from "@/components/AquariumView";
import EncyclopediaView from "@/components/EncyclopediaView";
import { GameProvider, useGame } from "@/components/GameProvider";
import { Onboarding, SettingsModal } from "@/components/Modals";
import RecordView from "@/components/RecordView";
import ShopView from "@/components/ShopView";
import StartScreen from "@/components/StartScreen";
import StudyView from "@/components/StudyView";
import WordManager from "@/components/WordManager";
import { getFishMaster } from "@/data/fishMaster";
import { buildSampleWords } from "@/data/sampleWords";
import { type BgmScene, playBgmForScene, sfx } from "@/lib/sound";

// 下部ナビに表示する4タブ
const NAV_TABS = [
  { id: "home", label: "ホーム", icon: "🏠" },
  { id: "aquarium", label: "水槽", icon: "🐠" },
  { id: "study", label: "しごと", icon: "💼" },
  { id: "shop", label: "ショップ", icon: "🛒" },
] as const;

// ナビ外のビュー（ホームから開く）
type TabId = (typeof NAV_TABS)[number]["id"] | "record" | "words" | "zukan" | "admin";

// ホーム画面のボタン一覧
const HOME_BUTTONS: { id: TabId | "settings" | "tutorial"; label: string; icon: string; desc: string }[] = [
  { id: "aquarium", label: "水槽", icon: "🐠", desc: "おさかなのお世話" },
  { id: "study", label: "しごと", icon: "💼", desc: "ゴールドを稼ぐ" },
  { id: "record", label: "記録", icon: "📊", desc: "しごと記録と通帳" },
  { id: "words", label: "単語帳", icon: "📚", desc: "単語の管理・追加" },
  { id: "zukan", label: "図鑑", icon: "📕", desc: "発見したおさかな" },
  { id: "shop", label: "ショップ", icon: "🛒", desc: "ガチャ・アイテム" },
  { id: "tutorial", label: "あそびかた", icon: "📖", desc: "チュートリアルを見る" },
  { id: "settings", label: "設定", icon: "⚙️", desc: "セーブ・音・初期化" },
  { id: "admin", label: "管理者", icon: "🔧", desc: "図鑑のおさかなを追加" },
];

function HomeView({
  onNavigate,
  onOpenSettings,
  onOpenTutorial,
}: {
  onNavigate: (tab: TabId) => void;
  onOpenSettings: () => void;
  onOpenTutorial: () => void;
}) {
  const { user, fishList, words } = useGame();
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl p-4 bg-mid">
        <div className="text-xs text-dim">ようこそ！</div>
        <div className="flex items-center justify-between mt-1">
          <div className="font-bold text-foam">
            職業Lv.{user.jobLevel}{" "}
            {user.achievedTitles.length > 0 && (
              <span className="text-xs text-sand">
                「{user.achievedTitles[user.achievedTitles.length - 1]}」
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-sand">🪙 {user.gold.toLocaleString()}G</div>
        </div>
        <div className="text-[10px] text-dim mt-1">
          🐠 {fishList.length}匹 / 📚 {words.length}語
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {HOME_BUTTONS.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              sfx.tap();
              if (b.id === "settings") onOpenSettings();
              else if (b.id === "tutorial") onOpenTutorial();
              else onNavigate(b.id);
            }}
            className="flex flex-col items-start gap-1 p-4 rounded-2xl bg-mid text-left active:scale-95 transition-transform"
          >
            <span className="text-2xl">{b.icon}</span>
            <span className="font-bold text-sm text-foam">{b.label}</span>
            <span className="text-[10px] text-dim">{b.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AppShell() {
  const game = useGame();
  const { ready, user, notices } = game;

  const [screen, setScreen] = useState<"start" | "app">("start");
  const [tab, setTab] = useState<TabId>("home");
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // クライアント側でクエリパラメータをチェック
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "admin") {
      setScreen("app");
      setTab("admin");
    }
  }, []);

  // タブIDをBGMシーンにマッピング
  const tabToScene = (t: TabId): BgmScene => {
    if (t === "home") return "home";
    if (t === "aquarium") return "study"; // 水槽は study BGM（海底からの手紙）
    if (t === "study") return null; // しごとタブは無音
    if (t === "shop") return "shop";
    return null; // record/words/zukan は無音
  };

  // タブ移動 + BGM切り替えをまとめて行うヘルパー
  const navigateTo = (newTab: TabId) => {
    setTab(newTab);
    void playBgmForScene(tabToScene(newTab));
  };

  const startGame = () => {
    setScreen("app");
    void playBgmForScene("home");
    if (!user.onboardingDone) {
      setShowOnboarding(true);
    }
  };

  const finishOnboarding = () => {
    game.saveWords(buildSampleWords());
    const starter = getFishMaster("ツノダシ");
    if (starter) game.addFishToTank(starter, "ツノちゃん");
    game.updateUser({ onboardingDone: true });
    setShowOnboarding(false);
    game.pushNotice("🐠", "ツノちゃんとサンプル単語10語をプレゼント！");
  };

  if (!ready) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-deep text-dim text-sm font-pixel">
        🫧 よみこみ中…
      </div>
    );
  }

  if (screen === "start") return <StartScreen onStart={startGame} />;

  return (
    <div className="w-full h-dvh flex flex-col mx-auto bg-deep" style={{ maxWidth: "480px" }}>
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 py-3 bg-sea border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌊</span>
          <span className="font-bold tracking-wider text-foam">AquaLingua</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="px-2.5 py-1 rounded-full bg-black/40 text-sand">
            🪙 {user.gold.toLocaleString()}G
          </span>
          <button
            onClick={() => setShowSettings(true)}
            className="text-lg active:scale-90 transition-transform"
            title="設定"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* メイン */}
      <main className="flex-1 overflow-y-auto">
        {tab === "home" && (
          <HomeView
            onNavigate={navigateTo}
            onOpenSettings={() => setShowSettings(true)}
            onOpenTutorial={() => setShowTutorial(true)}
          />
        )}
        {tab === "aquarium" && <AquariumView />}
        {tab === "study" && <StudyView />}
        {tab === "record" && <RecordView />}
        {tab === "words" && <WordManager />}
        {tab === "zukan" && <EncyclopediaView />}
        {tab === "shop" && <ShopView />}
        {tab === "admin" && <AdminView />}
      </main>

      {/* ボトムナビ（4タブ。記録・単語帳・図鑑はホームから開く） */}
      <nav className="flex bg-sea border-t border-white/10">
        {NAV_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              sfx.tap();
              navigateTo(t.id);
            }}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${
              tab === t.id ? "text-glow" : "text-dim"
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="text-[10px] font-bold">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* 通知トースト（成長・病気・逃走・称号など） */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 space-y-1.5 w-[90%] max-w-sm pointer-events-none">
        {notices.map((n) => (
          <div
            key={n.id}
            className="px-3 py-2 rounded-xl text-sm font-bold bg-black/80 text-foam shadow-lg text-center"
          >
            {n.icon} {n.text}
          </div>
        ))}
      </div>

      {/* モーダル */}
      {showOnboarding && <Onboarding onDone={finishOnboarding} />}
      {showTutorial && (
        <Onboarding viewOnly onDone={() => setShowTutorial(false)} />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function LoginScreen() {
  return (
    <div className="w-full h-dvh flex flex-col items-center justify-center bg-deep text-foam font-pixel p-4">
      <div className="text-center space-y-6">
        <div className="text-6xl">🌊</div>
        <h1 className="text-3xl font-bold">AquaLingua</h1>
        <p className="text-sm text-dim">水族館で英単語を学ぼう</p>

        <button
          onClick={() => signIn("google")}
          className="mt-8 px-6 py-3 bg-glow text-deep font-bold rounded-lg active:scale-95 transition-transform text-sm"
        >
          Google でログイン
        </button>
        <p className="text-xs text-dim">ゲーム進捗はクラウドに保存されます</p>
      </div>
    </div>
  );
}

export default function Page() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-deep text-dim text-sm font-pixel">
        🫧 よみこみ中…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginScreen />;
  }

  return (
    <GameProvider>
      <AppShell />
    </GameProvider>
  );
}
