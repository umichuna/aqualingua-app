"use client";

// 記録ビュー
// - 今日の統計（問題数・正答率・稼いだゴールド）
// - 学習カレンダー（直近5週間、日ごとの問題数をマスの濃さ＋語数で表示）
// - 最近の記録（日付単位グループ、クリックで内訳展開）
// - ゴールド通帳（入出金履歴・残高）

import { useMemo, useState } from "react";
import { todayString } from "@/lib/gameLogic";
import { useGame } from "./GameProvider";

type RecordTab = "stats" | "ledger";

export default function RecordView() {
  const { studySessions, goldLedger } = useGame();
  const [tab, setTab] = useState<RecordTab>("stats");

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-lg text-foam">記録</h2>

      {/* タブ切り替え */}
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ["stats", "📊 しごと記録"],
            ["ledger", "💰 通帳"],
          ] as [RecordTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-xs px-3 py-2 rounded-xl font-bold ${
              tab === id ? "bg-sand text-deep" : "bg-white/10 text-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stats" ? (
        <StatsPanel sessions={studySessions} />
      ) : (
        <LedgerPanel ledger={goldLedger} />
      )}
    </div>
  );
}

const MODE_LABEL: Record<string, string> = {
  self: "✍️ 自己採点",
  choice: "🎯 選択肢",
  listen: "🎧 聞き流し",
  free: "🆓 フリー",
};

// ---------- しごと記録（統計＋カレンダー＋履歴） ----------
function StatsPanel({
  sessions,
}: {
  sessions: ReturnType<typeof useGame>["studySessions"];
}) {
  const game = useGame();
  const today = todayString();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [mDate, setMDate] = useState(today);
  const [mLabel, setMLabel] = useState("");
  const [mCount, setMCount] = useState("");

  const submitManual = () => {
    const n = Math.floor(Number(mCount));
    if (!mDate || !mLabel.trim() || !Number.isFinite(n) || n <= 0) return;
    game.addManualSession(mDate, mLabel.trim(), n);
    setShowManual(false);
    setMLabel("");
    setMCount("");
    setMDate(today);
    setExpandedDate(mDate);
  };

  // 今日の集計
  const todayStats = useMemo(() => {
    const list = sessions.filter((s) => s.date === today);
    const count = list.reduce((sum, s) => sum + s.count, 0);
    const correct = list.reduce((sum, s) => sum + s.correctCount, 0);
    const gold = list.reduce((sum, s) => sum + s.goldEarned, 0);
    const quizList = list.filter((s) => s.mode === "self" || s.mode === "choice");
    const quizCount = quizList.reduce((sum, s) => sum + s.count, 0);
    const quizCorrect = quizList.reduce((sum, s) => sum + s.correctCount, 0);
    const accuracy = quizCount > 0 ? Math.round((quizCorrect / quizCount) * 100) : null;
    return { sessions: list.length, count, correct, gold, accuracy };
  }, [sessions, today]);

  // 日別の問題数（カレンダー用）
  const dailyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      map.set(s.date, (map.get(s.date) ?? 0) + Math.max(s.count, 1));
    }
    return map;
  }, [sessions]);

  // 直近5週間のカレンダー（日曜はじまり）
  const calendar = useMemo(() => {
    const weeks: { date: string; day: number; count: number; isToday: boolean }[][] = [];
    const now = new Date();
    const thisSunday = new Date(now);
    thisSunday.setDate(now.getDate() - now.getDay());
    for (let w = 4; w >= 0; w--) {
      const week: { date: string; day: number; count: number; isToday: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(thisSunday);
        dt.setDate(thisSunday.getDate() - w * 7 + d);
        const ds = todayString(dt);
        week.push({
          date: ds,
          day: dt.getDate(),
          count: dailyCounts.get(ds) ?? 0,
          isToday: ds === today,
        });
      }
      weeks.push(week);
    }
    return weeks;
  }, [dailyCounts, today]);

  // 日付ごとにグループ化した履歴（日付降順、30日分）
  const dailyGroups = useMemo(() => {
    const map = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([date, list]) => ({
        date,
        totalCount: list.reduce((sum, s) => sum + s.count, 0),
        totalGold: list.reduce((sum, s) => sum + s.goldEarned, 0),
        sessions: [...list].sort((a, b) => b.timestamp - a.timestamp),
      }));
  }, [sessions]);

  const cellColor = (count: number): string => {
    if (count === 0) return "rgba(255,255,255,0.06)";
    if (count < 10) return "#1E5288";
    if (count < 30) return "#2D8FC4";
    return "#37C8C3";
  };

  return (
    <div className="space-y-4">
      {/* 今日の統計 */}
      <div className="rounded-2xl p-4 bg-mid">
        <div className="text-xs font-bold text-glow mb-2">📅 今日のしごと</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-foam">{todayStats.count}</div>
            <div className="text-[10px] text-dim">問題数</div>
          </div>
          <div>
            <div className="text-xl font-bold text-foam">
              {todayStats.accuracy === null ? "--" : `${todayStats.accuracy}%`}
            </div>
            <div className="text-[10px] text-dim">正答率</div>
          </div>
          <div>
            <div className="text-xl font-bold text-sand">+{todayStats.gold}G</div>
            <div className="text-[10px] text-dim">稼いだ額</div>
          </div>
        </div>
      </div>

      {/* カレンダー */}
      <div className="rounded-2xl p-4 bg-mid">
        <div className="text-xs font-bold text-glow mb-2">🗓️ しごとカレンダー（直近5週間）</div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
            <div key={d} className="text-[9px] text-dim">{d}</div>
          ))}
          {calendar.flat().map((cell) => (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.count}問`}
              className="rounded flex flex-col items-center justify-center py-0.5 gap-0"
              style={{
                background: cellColor(cell.count),
                outline: cell.isToday ? "2px solid var(--aqua-glow)" : "none",
                color: cell.count > 0 ? "#F5EFE0" : "#9DB4C066",
                minHeight: "28px",
              }}
            >
              <span className="text-[9px] leading-none">{cell.day}</span>
              {cell.count > 0 && (
                <span className="text-[8px] leading-none opacity-80">{cell.count}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[9px] text-dim justify-end">
          <span>少</span>
          {[0, 5, 15, 35].map((n) => (
            <span
              key={n}
              className="w-3 h-3 rounded inline-block"
              style={{ background: cellColor(n) }}
            />
          ))}
          <span>多</span>
        </div>
      </div>

      {/* 日付グループ履歴（クリックで内訳展開） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-glow">📝 さいきんの記録</div>
          <button
            onClick={() => {
              setMDate(today);
              setShowManual(true);
            }}
            className="text-xs px-2.5 py-1 rounded-lg font-bold bg-sand text-deep"
          >
            ＋ 手入力で追加
          </button>
        </div>
        {dailyGroups.length === 0 && (
          <p className="text-xs text-dim">まだ記録がありません。しごとをしてみよう！</p>
        )}
        {dailyGroups.map((group) => {
          const isOpen = expandedDate === group.date;
          return (
            <div key={group.date} className="rounded-xl bg-mid overflow-hidden">
              {/* 日付ヘッダー（タップで展開） */}
              <button
                className="w-full flex items-center gap-2 p-2.5 text-xs active:bg-white/5 transition-colors"
                onClick={() => setExpandedDate(isOpen ? null : group.date)}
              >
                <span className="text-base">{isOpen ? "▼" : "▶"}</span>
                <div className="flex-1 text-left">
                  <span className="font-bold text-foam">{group.date}</span>
                  <span className="ml-2 text-dim">
                    {group.totalCount}問・{group.sessions.length}セッション
                  </span>
                </div>
                <span className="font-bold text-sand shrink-0">+{group.totalGold}G</span>
              </button>

              {/* 内訳（展開時） */}
              {isOpen && (
                <div className="border-t border-white/10 divide-y divide-white/5">
                  {group.sessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className="flex items-center gap-2 px-3 py-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-foam truncate">
                          {s.isManual ? "✋ 手入力" : (MODE_LABEL[s.mode] ?? s.mode)} — {s.label}
                          {s.isManual && (
                            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-dim align-middle">
                              手入力
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-dim">
                          {s.count > 0
                            ? `${s.count}問${!s.isManual && s.mode !== "listen" && s.mode !== "free" ? `（${s.correctCount}正解）` : ""}`
                            : s.label}
                        </div>
                        {s.memo && (
                          <div className="text-[10px] text-dim/80 mt-0.5 italic">📝 {s.memo}</div>
                        )}
                      </div>
                      <span className="font-bold text-sand shrink-0">+{s.goldEarned}G</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 手入力モーダル（過去の学習記録・ゴールド対象外） */}
      {showManual && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70"
          onClick={() => setShowManual(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs p-5 bg-sea font-pixel"
            style={{ border: "4px solid var(--aqua-glow)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
          >
            <div className="font-bold text-foam mb-3 text-center">✋ 過去の記録を手入力</div>
            <div className="text-[10px] text-dim mb-3 text-center">
              ※ 手入力の記録はゴールドの対象外です
            </div>
            <label className="block text-xs font-bold text-glow mb-1">日付</label>
            <input
              type="date"
              value={mDate}
              max={today}
              onChange={(e) => setMDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/40 text-foam outline-none mb-3"
            />
            <label className="block text-xs font-bold text-glow mb-1">項目名</label>
            <input
              value={mLabel}
              onChange={(e) => setMLabel(e.target.value)}
              maxLength={30}
              placeholder="例: 英単語アプリで復習"
              className="w-full px-3 py-2 rounded-lg bg-black/40 text-foam outline-none mb-3"
            />
            <label className="block text-xs font-bold text-glow mb-1">学習した数</label>
            <input
              type="number"
              min={1}
              value={mCount}
              onChange={(e) => setMCount(e.target.value)}
              placeholder="例: 20"
              className="w-full px-3 py-2 rounded-lg bg-black/40 text-foam outline-none mb-4 text-center font-bold"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowManual(false)}
                className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim"
              >
                キャンセル
              </button>
              <button
                onClick={submitManual}
                disabled={!mDate || !mLabel.trim() || Number(mCount) <= 0}
                className={`flex-1 py-2 text-sm font-bold ${
                  mDate && mLabel.trim() && Number(mCount) > 0
                    ? "bg-glow text-deep"
                    : "bg-white/10 text-dim"
                }`}
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- ゴールド通帳 ----------
function LedgerPanel({
  ledger,
}: {
  ledger: ReturnType<typeof useGame>["goldLedger"];
}) {
  const entries = useMemo(
    () => [...ledger].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50),
    [ledger]
  );

  const today = todayString();
  const todayIn = ledger
    .filter((e) => e.date === today && e.amount > 0)
    .reduce((s, e) => s + e.amount, 0);
  const todayOut = ledger
    .filter((e) => e.date === today && e.amount < 0)
    .reduce((s, e) => s + Math.abs(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 bg-mid">
        <div className="text-xs font-bold text-glow mb-2">📅 今日の入出金</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-glow">+{todayIn.toLocaleString()}G</div>
            <div className="text-[10px] text-dim">入金（稼いだ額）</div>
          </div>
          <div>
            <div className="text-xl font-bold text-coral">-{todayOut.toLocaleString()}G</div>
            <div className="text-[10px] text-dim">出金（使った額）</div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-bold text-glow">💰 入出金履歴（直近50件）</div>
        {entries.length === 0 && (
          <p className="text-xs text-dim">まだ履歴がありません。</p>
        )}
        {entries.map((e) => (
          <div key={e.entryId} className="flex items-center gap-2 rounded-xl p-2.5 bg-mid text-xs">
            <span className="text-base">{e.amount >= 0 ? "💵" : "🛒"}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foam truncate">{e.reason}</div>
              <div className="text-[10px] text-dim">{e.date}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-bold ${e.amount >= 0 ? "text-glow" : "text-coral"}`}>
                {e.amount >= 0 ? "+" : ""}
                {e.amount.toLocaleString()}G
              </div>
              <div className="text-[9px] text-dim">残高 {e.balance.toLocaleString()}G</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
