"use client";

// しごとモード（旧: 学習モード）
// - 3モード: 自己採点(10G/問) / 選択肢(8G/問) / 聞き流し(2G/問) ＋ フリーしごと
// - 出題設定: ジャンル・レベル・種別の複数選択、出題数の数字入力、日英方向、苦手優先、繰り返し
// - 出題中: 英単語の自動読み上げ・🔊ボタン・ヒントボタン（自己採点）
// - 正解するまで間違えた問題を繰り返すオプション

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MODE_BASE_GOLD, sessionGold } from "@/lib/gameLogic";
import { playBgmForScene, sfx } from "@/lib/sound";
import { cancelSpeech, releaseWakeLock, requestWakeLock, speak } from "@/lib/speech";
import { type StudyMode, type Word, type WordGenre, type WordLevel, type WordType } from "@/lib/types";
import { useGame } from "./GameProvider";

const LEVELS: WordLevel[] = ["1", "2", "3", "4", "5"];
const WORD_TYPES: WordType[] = ["単語", "述語", "会話文"];

const LEVEL_LABEL: Record<WordLevel, string> = {
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

type Direction = "en2ja" | "ja2en";

interface QuizConfig {
  genres: Set<WordGenre>; // 空 = すべて
  levels: Set<WordLevel>; // 空 = すべて
  wordTypes: Set<WordType>; // 空 = すべて
  count: number; // 0 = 全部
  weakFirst: boolean;
  direction: Direction;
  repeatUntilCorrect: boolean;
  listenAfterMode: "loop"; // 聞き流し終了後: 絞り込みをリピート
}

interface ChoiceQuestion {
  word: Word;
  prompt: string; // en2ja: スペル / ja2en: 意味
  choices: string[];
  correct: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Set のトグル（複数選択チップ用）
function toggleSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

// 複数選択チップ
function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap font-bold ${
        active ? "bg-sand text-deep" : "bg-white/10 text-dim"
      }`}
    >
      {label}
    </button>
  );
}

// ON/OFFトグル行
function Toggle({
  on,
  onToggle,
  title,
  desc,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-mid">
      <div>
        <div className="text-sm font-bold text-foam">{title}</div>
        <div className="text-[10px] text-dim">{desc}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-glow" : "bg-white/20"}`}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-foam transition-all"
          style={{ left: on ? "22px" : "2px" }}
        />
      </button>
    </div>
  );
}

export default function StudyView() {
  const game = useGame();
  const { words, wordStats, user } = game;
  const GENRES = game.allGenres;
  const weakCount = useMemo(
    () => Object.values(wordStats).filter((s) => s.incorrectCount > 0).length,
    [wordStats]
  );
  const [mode, setMode] = useState<StudyMode | "free" | null>(null);
  const [config, setConfig] = useState<QuizConfig>({
    genres: new Set(),
    levels: new Set(),
    wordTypes: new Set(),
    count: 10,
    weakFirst: false,
    direction: "ja2en",
    repeatUntilCorrect: true,
    listenAfterMode: "loop",
  });
  const [phase, setPhase] = useState<"setup" | "play" | "done">("setup");
  const [quizWords, setQuizWords] = useState<Word[]>([]); // 自己採点・聞き流しのキュー
  const [choiceQs, setChoiceQs] = useState<ChoiceQuestion[]>([]); // 選択肢クイズのキュー
  const [originalCount, setOriginalCount] = useState(0); // 繰り返し分を除いた問題数（報酬計算用）
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState(0); // 初回正解数
  const [earnedGold, setEarnedGold] = useState(0);
  const [resultExtra, setResultExtra] = useState<string[]>([]);
  // 繰り返し出題で2回目以降かどうかを判定（初回正解だけスコアに数える）
  const attemptedRef = useRef<Set<string>>(new Set());
  // セッション内の単語ごとの間違い回数（3回でに苦手登録）
  const sessionWrongRef = useRef<Record<string, number>>({});

  // ---------- 絞り込み（複数選択対応） ----------
  const filterPool = useCallback((): Word[] => {
    return words.filter(
      (w) =>
        (config.genres.size === 0 || config.genres.has(w.genre)) &&
        (config.levels.size === 0 || config.levels.has(w.level)) &&
        (config.wordTypes.size === 0 || config.wordTypes.has(w.wordType))
    );
  }, [words, config.genres, config.levels, config.wordTypes]);

  const maxCount = filterPool().length;
  const effectiveCount = Math.min(Math.max(1, config.count), maxCount);

  const buildQuizWords = useCallback((forListen: boolean = false): Word[] => {
    const pool = filterPool();
    let ordered: Word[];
    if (config.weakFirst && !forListen) {
      ordered = shuffle(pool).sort(
        (a, b) =>
          (wordStats[b.id]?.incorrectCount ?? 0) -
          (wordStats[a.id]?.incorrectCount ?? 0)
      );
    } else {
      ordered = shuffle(pool);
    }
    if (forListen) {
      return ordered;
    }
    return ordered.slice(0, Math.max(1, config.count));
  }, [filterPool, wordStats, config.weakFirst, config.count]);

  // 4択を方向に合わせて生成
  const buildChoiceQuestion = useCallback(
    (w: Word): ChoiceQuestion | null => {
      // 選択肢候補は常に問題と同じ種別（単語/述語/会話文）のみ。異なる種別を混在させない
      const pool = words.filter((x) => x.wordType === w.wordType);

      if (config.direction === "en2ja") {
        if (w.meanings.length === 0) return null;
        const allMeanings = Array.from(
          new Set(pool.flatMap((x) => x.meanings).filter(Boolean))
        );
        const correct = w.meanings[0];
        const wrongs = shuffle(
          allMeanings.filter((m) => !w.meanings.includes(m))
        ).slice(0, 3);
        if (wrongs.length < 3) return null;
        return { word: w, prompt: w.spelling, choices: shuffle([correct, ...wrongs]), correct };
      }
      // ja2en: 日本語の意味を見て英語スペルを選ぶ
      if (w.meanings.length === 0) return null;
      const allSpellings = Array.from(
        new Set(pool.map((x) => x.spelling).filter(Boolean))
      );
      const correct = w.spelling;
      const wrongs = shuffle(allSpellings.filter((s) => s !== w.spelling)).slice(0, 3);
      if (wrongs.length < 3) return null;
      return {
        word: w,
        prompt: w.meanings.join("、"),
        choices: shuffle([correct, ...wrongs]),
        correct,
      };
    },
    [words, config.direction]
  );

  const startQuiz = (m: StudyMode) => {
    if (m !== "listen" && config.count === 0) {
      game.pushNotice("⚠️", "数字を入力してください");
      return;
    }
    const qWords = buildQuizWords(m === "listen");
    if (qWords.length === 0) {
      game.pushNotice("📚", "出題できる単語がない！単語帳に追加しよう");
      return;
    }
    if (m === "choice") {
      const qs = qWords
        .map(buildChoiceQuestion)
        .filter((q): q is ChoiceQuestion => q !== null);
      if (qs.length < 1) {
        game.pushNotice("📚", "この種別では4択を作れないよ（同じ種別の単語が4つ以上必要）");
        return;
      }
      setChoiceQs(qs);
      setOriginalCount(qs.length);
    } else {
      setOriginalCount(qWords.length);
    }
    attemptedRef.current = new Set();
    sessionWrongRef.current = {};
    setQuizWords(qWords);
    setQIndex(0);
    setScore(0);
    setPicked(null);
    setFlipped(false);
    void playBgmForScene(null);
    setPhase("play");
    sfx.tap();
  };

  const finishQuiz = useCallback(
    (m: StudyMode, finalScore: number, countOverride?: number) => {
      const count = countOverride ?? originalCount;
      const res = game.completeStudy(m, count, finalScore);
      setEarnedGold(res.gold);
      setOriginalCount(count);
      const extras: string[] = [];
      if (res.leveledUp) extras.push(`🎖️ 職業レベルが Lv.${user.jobLevel + 1} に上がった！`);
      for (const t of res.newTitles) extras.push(`👑 称号「${t}」を獲得！`);
      setResultExtra(extras);
      setScore(finalScore);
      setPhase("done");
      sfx.complete(); // チャリーン（仕事完了音）
      if (res.leveledUp || res.newTitles.length > 0) sfx.levelUp();
      void playBgmForScene("home");
    },
    [game, user.jobLevel, originalCount]
  );

  const backToMenu = () => {
    cancelSpeech();
    releaseWakeLock();
    setMode(null);
    setPhase("setup");
  };

  // ============ モード選択 ============
  if (!mode) {
    const MODES: { id: StudyMode; label: string; desc: string; icon: string }[] = [
      { id: "self", label: "自己採点", desc: "意味を思い浮かべて自分で○✕", icon: "✍️" },
      { id: "choice", label: "選択肢クイズ", desc: "4択から正しい答えを選ぶ", icon: "🎯" },
      { id: "listen", label: "聞き流し", desc: "音声でスライドショー再生", icon: "🎧" },
    ];
    return (
      <div className="p-4 space-y-3">
        <h2 className="font-bold text-lg text-foam">きょうのしごと</h2>
        <p className="text-xs text-dim">
          しごとを完了するとゴールドがもらえます
        </p>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              sfx.tap();
              setMode(m.id);
              setPhase("setup");
            }}
            className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-transform active:scale-95 bg-mid"
          >
            <span className="text-2xl">{m.icon}</span>
            <div className="flex-1">
              <div className="font-bold text-foam">{m.label}</div>
              <div className="text-xs text-dim">{m.desc}</div>
            </div>
            <span className="text-sm font-bold text-sand">{MODE_BASE_GOLD[m.id]}G/問</span>
          </button>
        ))}
        <button
          onClick={() => {
            sfx.tap();
            setMode("free");
          }}
          className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-transform active:scale-95 bg-mid"
        >
          <span className="text-2xl">🆓</span>
          <div className="flex-1">
            <div className="font-bold text-foam">フリー</div>
            <div className="text-xs text-dim">内容と金額を自由に入力（例: 筋トレ 50G）</div>
          </div>
        </button>
        {words.length === 0 && (
          <p className="text-xs text-coral pt-2">
            ⚠️ 単語帳が空です。「単語帳」からCSV取り込みか手動追加をしてね
          </p>
        )}
      </div>
    );
  }

  // ============ フリーしごと ============
  if (mode === "free") {
    return <FreeWork onQuit={backToMenu} />;
  }

  // ============ 出題設定 ============
  if (phase === "setup") {
    const estimatedGold = sessionGold(mode, effectiveCount, user.jobLevel);

    return (
      <div className="p-4 space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-foam">出題設定</h2>
          <button onClick={backToMenu} className="text-xs px-3 py-1 rounded-lg bg-white/10 text-dim">
            ← 戻る
          </button>
        </div>

        {/* 出題方向 */}
        <div>
          <div className="text-xs font-bold text-glow mb-1.5">出題方向</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["en2ja", "英語 → 日本語"],
                ["ja2en", "日本語 → 英語"],
              ] as [Direction, string][]
            ).map(([d, label]) => (
              <button
                key={d}
                onClick={() => setConfig((c) => ({ ...c, direction: d }))}
                className={`text-xs px-3 py-2 rounded-xl font-bold ${
                  config.direction === d ? "bg-sand text-deep" : "bg-white/10 text-dim"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 種別（複数選択） */}
        <div>
          <div className="text-xs font-bold text-glow mb-1.5">
            種別（複数選択可・未選択=すべて）
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {WORD_TYPES.map((t) => (
              <Chip key={t} active={config.wordTypes.has(t)} label={t}
                onClick={() => setConfig((c) => ({ ...c, wordTypes: toggleSet(c.wordTypes, t) }))} />
            ))}
          </div>
        </div>

        {/* ジャンル（複数選択） */}
        <div>
          <div className="text-xs font-bold text-glow mb-1.5">
            ジャンル（複数選択可・未選択=すべて）
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {GENRES.map((g) => (
              <Chip key={g} active={config.genres.has(g)} label={g}
                onClick={() => setConfig((c) => ({ ...c, genres: toggleSet(c.genres, g) }))} />
            ))}
          </div>
        </div>

        {/* レベル（複数選択） */}
        <div>
          <div className="text-xs font-bold text-glow mb-1.5">
            レベル（複数選択可・未選択=すべて）
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {LEVELS.map((l) => (
              <Chip key={l} active={config.levels.has(l)} label={LEVEL_LABEL[l]}
                onClick={() => setConfig((c) => ({ ...c, levels: toggleSet(c.levels, l) }))} />
            ))}
          </div>
        </div>

        {/* 出題数（数字入力）※聞き流しはエンドレスなので非表示 */}
        {mode !== "listen" && (
          <div>
            <div className="text-xs font-bold text-glow mb-1.5">
              出題数（最大 {maxCount} 問）
            </div>
            <input
              type="number"
              min={1}
              max={maxCount}
              value={config.count || ""}
              onChange={(e) => {
                const val = e.target.value.trim();
                const n = val === "" ? 0 : Math.max(1, Math.floor(Number(val)));
                setConfig((c) => ({ ...c, count: n }));
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-mid text-foam outline-none text-center font-bold"
            />
            {config.count > maxCount && maxCount > 0 && (
              <p className="text-[10px] text-coral mt-1">
                ※ 絞り込みの結果 {maxCount} 問しかないため、{maxCount} 問になります
              </p>
            )}
          </div>
        )}

        {mode === "listen" && (
          <div className="space-y-3">
            <div className={`rounded-xl p-3 text-center font-bold ${maxCount === 0 ? "bg-coral/10 text-coral" : "bg-mid text-foam"}`}>
              🎧 対象: {maxCount}語
              {maxCount === 0 && <div className="text-xs font-normal mt-0.5">絞り込み条件を変えてみてね</div>}
            </div>
            <p className="text-xs text-dim">
              「終了」を押すまでエンドレスで再生します。終了した時点で聞いた問題数ぶんのゴールドがもらえます。
            </p>
          </div>
        )}

        <Toggle
          on={config.weakFirst}
          onToggle={() => setConfig((c) => ({ ...c, weakFirst: !c.weakFirst }))}
          title="苦手単語を優先"
          desc="間違えた回数が多い単語から出題する"
        />
        {weakCount > 0 && (
          <div className="text-center text-xs text-coral font-bold">
            ⚠️ 苦手な単語が {weakCount} 語たまっています
          </div>
        )}
        {weakCount === 0 && Object.keys(wordStats).length > 0 && (
          <div className="text-center text-xs text-glow font-bold">
            ✅ 苦手な単語は 0 語です
          </div>
        )}

        {/* 「正解するまで繰り返す」は聞き流しでは不要なので非表示 */}
        {mode !== "listen" && (
          <Toggle
            on={config.repeatUntilCorrect}
            onToggle={() =>
              setConfig((c) => ({ ...c, repeatUntilCorrect: !c.repeatUntilCorrect }))
            }
            title="正解するまで繰り返す"
            desc="間違えた問題を最後にもう一度出題する（全問正解で終了）"
          />
        )}

        <button
          onClick={() => startQuiz(mode)}
          disabled={maxCount === 0}
          className={`w-full py-3 rounded-2xl font-bold active:scale-95 transition-transform ${
            maxCount === 0 ? "bg-white/10 text-dim" : "bg-glow text-deep"
          }`}
        >
          {maxCount === 0
            ? "出題できる単語がありません"
            : mode === "listen"
              ? "聞き流しをはじめる"
              : `はじめる（${effectiveCount}問・+${estimatedGold}G）`}
        </button>
      </div>
    );
  }

  // ============ 結果画面 ============
  if (phase === "done") {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full gap-3">
        <div className="text-5xl">🎉</div>
        {mode !== "listen" && (
          <div className="font-bold text-xl text-foam">
            {score} / {originalCount} 正解！
          </div>
        )}
        {mode === "listen" && (
          <div className="font-bold text-xl text-foam">聞き流し完了！</div>
        )}
        <div className="text-sm font-bold text-sand">+{earnedGold}G ゲット</div>
        {resultExtra.map((t) => (
          <div key={t} className="text-sm font-bold text-glow">{t}</div>
        ))}
        <button
          onClick={backToMenu}
          className="mt-2 px-4 py-2 rounded-xl text-sm font-bold bg-glow text-deep"
        >
          しごと選択へ戻る
        </button>
      </div>
    );
  }

  // ============ プレイ画面 ============
  if (mode === "choice") {
    return (
      <ChoicePlay
        questions={choiceQs}
        qIndex={qIndex}
        picked={picked}
        direction={config.direction}
        onPick={(c) => {
          if (picked) return;
          setPicked(c);
          const q = choiceQs[qIndex];
          const correct = c === q.correct;
          const firstTry = !attemptedRef.current.has(q.word.id);
          attemptedRef.current.add(q.word.id);
          if (correct) sfx.correct();
          else sfx.wrong();
          if (correct) {
            if (firstTry) {
              setScore((s) => s + 1);
              game.resetWordWeak(q.word.id); // 1発正解で苦手リセット（セッションをまたいでもOK）
            }
            game.recordAnswer(q.word.id, true);
          } else {
            const cnt = (sessionWrongRef.current[q.word.id] ?? 0) + 1;
            sessionWrongRef.current[q.word.id] = cnt;
            if (cnt === 3) {
              game.recordAnswer(q.word.id, false); // セッション内3回目で苦手登録
            }
          }
          // 間違えた問題を末尾に追加（繰り返しオプション）
          let queue = choiceQs;
          if (!correct && config.repeatUntilCorrect) {
            queue = [...choiceQs, q];
            setChoiceQs(queue);
          }
          const newScore = score + (correct && firstTry ? 1 : 0);
          // 不正解時は正解を確認できるよう少し長めに待つ
          setTimeout(() => {
            if (qIndex + 1 < queue.length) {
              setQIndex((i) => i + 1);
              setPicked(null);
            } else {
              finishQuiz("choice", newScore);
            }
          }, correct ? 900 : 1400);
        }}
        onQuit={backToMenu}
      />
    );
  }

  if (mode === "self") {
    return (
      <SelfPlay
        words={quizWords}
        qIndex={qIndex}
        flipped={flipped}
        setFlipped={setFlipped}
        direction={config.direction}
        onJudge={(ok) => {
          const w = quizWords[qIndex];
          const firstTry = !attemptedRef.current.has(w.id);
          attemptedRef.current.add(w.id);
          if (ok) sfx.correct();
          else sfx.wrong();
          if (ok) {
            if (firstTry) {
              setScore((s) => s + 1);
              game.resetWordWeak(w.id); // 1発正解で苦手リセット（セッションをまたいでもOK）
            }
            game.recordAnswer(w.id, true);
          } else {
            const cnt = (sessionWrongRef.current[w.id] ?? 0) + 1;
            sessionWrongRef.current[w.id] = cnt;
            if (cnt === 3) {
              game.recordAnswer(w.id, false); // セッション内3回目で苦手登録
            }
          }
          let queue = quizWords;
          if (!ok && config.repeatUntilCorrect) {
            queue = [...quizWords, w];
            setQuizWords(queue);
          }
          const newScore = score + (ok && firstTry ? 1 : 0);
          if (qIndex + 1 < queue.length) {
            setQIndex((i) => i + 1);
            setFlipped(false);
          } else {
            finishQuiz("self", newScore);
          }
        }}
        onQuit={backToMenu}
      />
    );
  }

  return (
    <ListenPlay
      words={quizWords}
      direction={config.direction}
      onFinish={(playedCount) => finishQuiz("listen", playedCount, playedCount)}
      onQuit={backToMenu}
    />
  );
}

// ---------- フリーしごと ----------
function FreeWork({ onQuit }: { onQuit: () => void }) {
  const game = useGame();
  const { user } = game;
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<{ label: string; amount: number } | null>(null);
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoValue, setMemoValue] = useState(user.freeMemo ?? "");

  const saveMemo = () => {
    game.updateUser({ freeMemo: memoValue.trim() || undefined });
    setEditingMemo(false);
  };

  const submit = () => {
    const n = Math.floor(Number(amount));
    if (!label.trim() || !Number.isFinite(n) || n <= 0) return;
    game.completeFreeWork(label.trim(), n);
    sfx.complete();
    setDone({ label: label.trim(), amount: n });
  };

  if (done) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full gap-3">
        <div className="text-5xl">💪</div>
        <div className="font-bold text-xl text-foam">{done.label} おつかれさま！</div>
        <div className="text-sm font-bold text-sand">+{done.amount}G ゲット</div>
        <button
          onClick={onQuit}
          className="mt-2 px-4 py-2 rounded-xl text-sm font-bold bg-glow text-deep"
        >
          しごと選択へ戻る
        </button>
      </div>
    );
  }

  const valid = label.trim().length > 0 && Number(amount) > 0;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-foam">フリーしごと</h2>
        <button onClick={onQuit} className="text-xs px-3 py-1 rounded-lg bg-white/10 text-dim">
          ← 戻る
        </button>
      </div>

      {/* 永続メモエリア */}
      <div className="rounded-xl bg-mid p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-glow">📝 フリーメモ</span>
          {!editingMemo && (
            <button
              onClick={() => { setMemoValue(user.freeMemo ?? ""); setEditingMemo(true); }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-dim"
            >
              ✏️ 編集
            </button>
          )}
        </div>
        {editingMemo ? (
          <>
            <textarea
              value={memoValue}
              onChange={(e) => setMemoValue(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="自由に書けます（例: 今日の調子・目標・ひとこと）"
              className="w-full px-3 py-2 rounded-lg bg-black/30 text-foam outline-none text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setEditingMemo(false)}
                className="flex-1 py-1.5 text-xs font-bold bg-white/10 text-dim rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={saveMemo}
                className="flex-1 py-1.5 text-xs font-bold bg-glow text-deep rounded-lg"
              >
                保存
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-foam whitespace-pre-wrap min-h-[2rem]">
            {user.freeMemo || <span className="text-dim">（メモなし）</span>}
          </p>
        )}
      </div>

      <p className="text-xs text-dim">
        英語以外のがんばりもゴールドにできます（例: 筋トレ 50）
      </p>
      <div>
        <div className="text-xs font-bold text-glow mb-1.5">内容</div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={20}
          placeholder="例: 筋トレ"
          className="w-full px-3 py-2.5 rounded-xl bg-mid text-foam outline-none"
        />
      </div>
      <div>
        <div className="text-xs font-bold text-glow mb-1.5">金額（G）</div>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="例: 50"
          className="w-full px-3 py-2.5 rounded-xl bg-mid text-foam outline-none text-center font-bold"
        />
      </div>
      <button
        onClick={submit}
        disabled={!valid}
        className={`w-full py-3 rounded-2xl font-bold active:scale-95 transition-transform ${
          valid ? "bg-glow text-deep" : "bg-white/10 text-dim"
        }`}
      >
        かんりょう！
      </button>
    </div>
  );
}

// ---------- 選択肢クイズ ----------
function ChoicePlay({
  questions,
  qIndex,
  picked,
  direction,
  onPick,
  onQuit,
}: {
  questions: ChoiceQuestion[];
  qIndex: number;
  picked: string | null;
  direction: Direction;
  onPick: (c: string) => void;
  onQuit: () => void;
}) {
  const q = questions[qIndex];

  // 出題時に英単語を自動読み上げ（日本語→英語モードでは答えがバレるので回答後のみ）
  useEffect(() => {
    if (!q) return;
    if (direction === "en2ja") {
      void speak(q.word.spelling);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex]);

  // ja2en は回答後に正解の発音を読み上げ
  useEffect(() => {
    if (!q || !picked) return;
    if (direction === "ja2en") {
      void speak(q.word.spelling);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  if (!q) return null;
  const showSpeaker = direction === "en2ja" || picked !== null;
  const isCorrect = picked !== null && picked === q.correct;
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex justify-between text-xs text-dim">
        <button onClick={onQuit} className="underline">← やめる</button>
        <span>
          {qIndex + 1} / {questions.length}
        </span>
      </div>
      {/* 回答後の正解／不正解バナー */}
      <div className="h-9 flex items-center justify-center">
        {picked !== null && (
          <div
            className={`text-2xl font-bold tracking-widest ${
              isCorrect ? "text-glow" : "text-coral"
            }`}
          >
            {isCorrect ? "⭕ 正解！" : "❌ ざんねん…"}
          </div>
        )}
      </div>
      <div className="rounded-2xl p-6 text-center bg-mid">
        <div className="flex items-center justify-center gap-2">
          <div className="text-3xl font-bold tracking-wide text-foam">
            {q.prompt}
          </div>
          {showSpeaker && (
            <button
              onClick={() => speak(q.word.spelling)}
              className="text-xl px-2 py-1 rounded-lg bg-white/10 active:scale-95 transition-transform"
              aria-label="発音を聞く"
            >
              🔊
            </button>
          )}
        </div>
        <div className="text-xs mt-2 text-dim">
          {direction === "en2ja" ? "正しい意味を選ぼう" : "正しい英語を選ぼう"}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {q.choices.map((c) => {
          let cls = "bg-white/10 text-foam";
          if (picked) {
            if (c === q.correct) cls = "bg-glow text-deep";
            else if (c === picked) cls = "bg-coral text-deep";
          }
          return (
            <button
              key={c}
              onClick={() => onPick(c)}
              className={`p-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${cls}`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 自己採点 ----------
function SelfPlay({
  words,
  qIndex,
  flipped,
  setFlipped,
  direction,
  onJudge,
  onQuit,
}: {
  words: Word[];
  qIndex: number;
  flipped: boolean;
  setFlipped: (b: boolean) => void;
  direction: Direction;
  onJudge: (ok: boolean) => void;
  onQuit: () => void;
}) {
  // どの問題番号でヒントを開いたかを記録（問題が進めば自動的に非表示に戻る）
  const [hintFor, setHintFor] = useState<number | null>(null);
  const showHint = hintFor === qIndex;
  const w = words[qIndex];

  // 英→日なら出題時に自動読み上げ
  useEffect(() => {
    if (w && direction === "en2ja") {
      void speak(w.spelling);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex]);

  // カードをめくった時に英語を自動読み上げ（ja2en: 答えが英語なので必須、en2ja: 再確認用）
  useEffect(() => {
    if (w && flipped) void speak(w.spelling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  if (!w) return null;

  // 表面・裏面の内容を方向で切り替え
  const front = direction === "en2ja" ? w.spelling : w.meanings.join("、") || "（意味は未登録）";
  const back =
    direction === "en2ja"
      ? w.meanings.length > 0
        ? w.meanings.join("、")
        : "（意味は未登録）"
      : w.spelling;
  // ヒント = 答えの最初の1文字
  const hintSource = direction === "en2ja" ? (w.meanings[0] ?? "") : w.spelling;
  const hint = hintSource ? `${hintSource[0]}…` : "（ヒントなし）";
  // 🔊 は英→日では常時OK。日→英ではスペルがバレるのでめくった後のみ表示
  const showSpeaker = direction === "en2ja" || flipped;

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex justify-between text-xs text-dim">
        <button onClick={onQuit} className="underline">← やめる</button>
        <span>
          {qIndex + 1} / {words.length}
        </span>
      </div>
      <button
        onClick={() => setFlipped(!flipped)}
        className="rounded-2xl p-6 text-center bg-mid min-h-48 flex flex-col items-center justify-center gap-2"
      >
        <div className="text-3xl font-bold tracking-wide text-foam">{front}</div>
        {flipped ? (
          <>
            <div className="text-base font-bold text-glow">{back}</div>
            {w.exampleSentence && (
              <div className="text-xs text-foam mt-1">{w.exampleSentence}</div>
            )}
            {w.exampleTranslation && (
              <div className="text-xs text-dim">{w.exampleTranslation}</div>
            )}
          </>
        ) : (
          <>
            {showHint && (
              <div className="text-base font-bold text-sand">💡 {hint}</div>
            )}
            <div className="text-xs text-dim mt-2">タップで答えをひらく</div>
          </>
        )}
      </button>
      <div className="flex gap-2">
        {showSpeaker && (
          <button
            onClick={() => speak(w.spelling)}
            className="px-4 py-2.5 rounded-xl font-bold bg-white/10 text-foam active:scale-95 transition-transform"
            aria-label="発音を聞く"
          >
            🔊
          </button>
        )}
        {!flipped && (
          <button
            onClick={() => setHintFor(qIndex)}
            disabled={showHint}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform ${
              showHint ? "bg-white/10 text-dim" : "bg-sand text-deep"
            }`}
          >
            💡 ヒント（最初の1文字）
          </button>
        )}
      </div>
      <div className="mt-auto">
        {!flipped ? (
          <button
            onClick={() => setFlipped(true)}
            className="w-full py-3 rounded-xl font-bold transition-transform active:scale-95 bg-sand text-deep"
          >
            答えを見る
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => onJudge(false)}
              className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-coral text-deep"
            >
              ✕ 不正解
            </button>
            <button
              onClick={() => onJudge(true)}
              className="flex-1 py-3 rounded-xl font-bold transition-transform active:scale-95 bg-glow text-deep"
            >
              ○ 正解
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 聞き流し（エンドレス再生） ----------
function ListenPlay({
  words,
  direction,
  onFinish,
  onQuit,
}: {
  words: Word[];
  direction: Direction;
  onFinish: (playedCount: number) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [playedCount, setPlayedCount] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1.0);
  const indexRef = useRef(0);
  const playedRef = useRef(0);
  const playingRef = useRef(true);
  const rateRef = useRef(1.0);
  const currentWordsRef = useRef<Word[]>(words);
  const skipRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
    rateRef.current = rate;
  }, [playing, rate]);

  // Wake Lock（聞き流し中のスリープ防止）
  useEffect(() => {
    void requestWakeLock();
    return () => {
      releaseWakeLock();
      cancelSpeech();
    };
  }, []);

  // Media Session API: OS/ブラウザのメディアコントロール（イヤホンボタン等）に対応
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => {
      cancelSpeech();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      cancelSpeech();
      const next = (indexRef.current + 1) % currentWordsRef.current.length;
      indexRef.current = next;
      setIndex(next);
      skipRef.current = true;
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 現在の単語が変わったらロック画面・通知センターのメタデータを更新
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const word = currentWordsRef.current[index];
    if (!word) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: word.spelling,
      artist: word.meanings.join("、"),
      album: "AquaLingua 聞き流し",
    });
  }, [index]);

  // 再生/一時停止状態をOSに通知
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  // 自動再生ループ: 英語 → 日本語 → 英語 → 日本語
  useEffect(() => {
    let stopped = false;
    (async () => {
      while (!stopped) {
        if (!playingRef.current) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        const pool = currentWordsRef.current;
        const w = pool[indexRef.current];
        const meaning = w.meanings.length > 0 ? w.meanings.join("、") : null;
        const speakPair = async () => {
          if (direction === "ja2en") {
            if (meaning) await speak(meaning, "ja-JP", rateRef.current);
            if (stopped || !playingRef.current || skipRef.current) return;
            await speak(w.spelling, "en-US", rateRef.current);
          } else {
            await speak(w.spelling, "en-US", rateRef.current);
            if (stopped || !playingRef.current || skipRef.current) return;
            if (meaning) await speak(meaning, "ja-JP", rateRef.current);
          }
        };
        // 1回目
        await speakPair();
        if (stopped || skipRef.current) { skipRef.current = false; continue; }
        if (!playingRef.current) continue;
        await new Promise((r) => setTimeout(r, 400));
        // 2回目
        await speakPair();
        if (stopped || skipRef.current) { skipRef.current = false; continue; }
        await new Promise((r) => setTimeout(r, 700));
        // 1問ぶん聞き終わった
        playedRef.current += 1;
        setPlayedCount(playedRef.current);
        const nextIdx = indexRef.current + 1;
        if (nextIdx >= currentWordsRef.current.length) {
          // 一周完了 — 絞り込みリストの先頭に戻る
          indexRef.current = 0;
        } else {
          indexRef.current = nextIdx;
        }
        setIndex(indexRef.current);
      }
    })();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = currentWordsRef.current[Math.min(index, currentWordsRef.current.length - 1)];
  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex justify-between text-xs text-dim">
        <button onClick={onQuit} className="underline">← やめる</button>
        <span>聞いた数: {playedCount}問</span>
      </div>
      <div className="rounded-2xl p-6 text-center bg-mid flex-1 flex flex-col items-center justify-center gap-2">
        <div className="text-xs text-glow">🎧 聞き流し中（画面はスリープしません）</div>
        <div className="text-3xl font-bold tracking-wide text-foam">{w?.spelling}</div>
        <div className="text-base font-bold text-glow">{w?.meanings.join("、")}</div>
        <div className="text-[10px] text-dim mt-1">
          {direction === "ja2en" ? "日本語 → 英語" : "英語 → 日本語"} を2回くり返します（{index + 1} / {currentWordsRef.current.length}語目）
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (playing) cancelSpeech();
            setPlaying(!playing);
          }}
          className="flex-1 py-3 rounded-xl font-bold bg-glow text-deep active:scale-95 transition-transform"
        >
          {playing ? "⏸ 一時停止" : "▶ 再開"}
        </button>
        <div className="flex gap-1">
          {[0.75, 1.0, 1.25].map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              className={`text-xs px-2.5 py-2 rounded-lg font-bold ${rate === r ? "bg-sand text-deep" : "bg-white/10 text-dim"}`}
            >
              ×{r}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={() => {
          cancelSpeech();
          onFinish(playedRef.current);
        }}
        className="w-full py-3 rounded-xl font-bold bg-sand text-deep active:scale-95 transition-transform"
      >
        ⏹ 終了する（{playedCount}問ぶんゴールド獲得）
      </button>
    </div>
  );
}
