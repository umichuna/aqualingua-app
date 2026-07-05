"use client";

// 穴抜け問題ビュー
// - 問題一覧・追加・編集・CSV一括インポート（papaparse）・4択クイズ出題
// - 〈〉プレースホルダーを選択肢で埋める形式

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import type { BlankQuestion, WordGenre } from "@/lib/types";
import { useGame } from "./GameProvider";

const PLACEHOLDER = "〈〉";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderSentence(sentence: string, answer?: string) {
  const parts = sentence.split(PLACEHOLDER);
  const fills = answer ? answer.split(" ") : [];
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <span className="inline-block mx-0.5 px-2 py-0.5 rounded bg-glow/20 text-glow font-bold min-w-8 text-center">
          {fills[i] ?? "　"}
        </span>
      )}
    </span>
  ));
}

// ---- クイズ画面（StudyView からも import して使う） ----
export function QuizPlay({
  questions,
  stats,
  onRecord,
  onFinish,
  onQuit,
}: {
  questions: BlankQuestion[];
  stats: Record<string, { incorrectCount: number }>;
  onRecord: (id: string, correct: boolean) => void;
  onFinish: (score: number, total: number) => void;
  onQuit?: (completedCount: number, score: number) => void;
}) {
  // キュー方式: 不正解は末尾に追加して正解するまで繰り返す
  const [queue, setQueue] = useState<BlankQuestion[]>([...questions]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const firstAttempted = useRef<Set<string>>(new Set()); // 初回挑戦済みID（スコアの二重加算防止）

  const q = queue[queueIdx];
  const choices = useMemo(
    () => (q ? shuffle([q.answer, ...q.wrongChoices]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueIdx]
  );

  if (!q) return null;
  const isCorrect = picked === q.answer;
  const correctCount = firstAttempted.current.size; // 初回正解済み問題数（進捗表示用）

  const next = () => {
    if (!picked) return;
    if (isCorrect) {
      // 正解: キューの次へ
      if (queueIdx + 1 >= queue.length) {
        onFinish(score, questions.length);
      } else {
        setQueueIdx((i) => i + 1);
        setPicked(null);
      }
    } else {
      // 不正解: 末尾に追加して次へ
      const next = [...queue, q];
      setQueue(next);
      setQueueIdx((i) => i + 1);
      setPicked(null);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex justify-between text-xs text-dim">
        <button onClick={() => onQuit?.(correctCount, score)} className="underline">← やめる</button>
        <span>{correctCount} / {questions.length}</span>
        {stats[q.id]?.incorrectCount ? (
          <span className="text-coral">⚠️ 苦手 {stats[q.id].incorrectCount}回</span>
        ) : null}
      </div>

      {/* 問題文 */}
      <div className="rounded-2xl p-5 bg-mid text-center flex-1 flex flex-col items-center justify-center gap-2">
        <div className="text-xs text-dim mb-1">〈〉に入る語句を選ぼう</div>
        <div className="text-base font-bold text-foam leading-relaxed">
          {renderSentence(q.sentence)}
        </div>
        <div className="text-xs text-dim mt-1">{q.japaneseText}</div>
      </div>

      {/* 正誤バナー */}
      {picked && (
        <div className={`text-center text-sm font-bold ${isCorrect ? "text-glow" : "text-coral"}`}>
          {isCorrect ? "⭕ 正解！" : `❌ 正解は「${q.answer}」`}
          {!isCorrect && q.explanation && (
            <div className="text-xs font-normal mt-0.5 text-dim">{q.explanation}</div>
          )}
        </div>
      )}

      {/* 選択肢 */}
      <div className="grid grid-cols-1 gap-2">
        {choices.map((c) => {
          let cls = "bg-white/10 text-foam";
          if (picked) {
            if (c === q.answer) cls = "bg-glow text-deep";
            else if (c === picked) cls = "bg-coral text-deep";
          }
          return (
            <button
              key={c}
              disabled={!!picked}
              onClick={() => {
                setPicked(c);
                const ok = c === q.answer;
                const isFirst = !firstAttempted.current.has(q.id);
                if (ok && isFirst) {
                  setScore((s) => s + 1);
                  firstAttempted.current.add(q.id);
                }
                onRecord(q.id, ok);
              }}
              className={`py-3 px-4 rounded-xl font-bold text-sm text-left transition-all active:scale-95 ${cls}`}
            >
              {renderSentence(q.sentence, c)}
            </button>
          );
        })}
      </div>

      {picked && (
        <button
          onClick={next}
          className="w-full py-3 rounded-xl font-bold bg-sand text-deep active:scale-95 transition-transform"
        >
          {isCorrect && correctCount + 1 >= questions.length
            ? "結果を見る"
            : isCorrect
            ? "次へ →"
            : "もう一度チャレンジ →"}
        </button>
      )}
    </div>
  );
}

// ---- 追加・編集フォーム ----
function QuestionForm({
  initial,
  isNew,
  genres,
  onSave,
  onClose,
}: {
  initial: Partial<BlankQuestion>;
  isNew: boolean;
  genres: WordGenre[];
  onSave: (data: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">) => void;
  onClose: () => void;
}) {
  const [sentence, setSentence] = useState(initial.sentence ?? "");
  const [japaneseText, setJapaneseText] = useState(initial.japaneseText ?? "");
  const [answer, setAnswer] = useState(initial.answer ?? "");
  const [wrong1, setWrong1] = useState(initial.wrongChoices?.[0] ?? "");
  const [wrong2, setWrong2] = useState(initial.wrongChoices?.[1] ?? "");
  const [wrong3, setWrong3] = useState(initial.wrongChoices?.[2] ?? "");
  const [explanation, setExplanation] = useState(initial.explanation ?? "");
  const [genre, setGenre] = useState<WordGenre>(initial.genre ?? "未分類");
  const [error, setError] = useState("");

  const submit = () => {
    if (!sentence.includes(PLACEHOLDER)) { setError(`文に ${PLACEHOLDER} を含めてください`); return; }
    if (!japaneseText.trim()) { setError("日本語訳を入力してください"); return; }
    if (!answer.trim()) { setError("正解を入力してください"); return; }
    if (!wrong1.trim() || !wrong2.trim() || !wrong3.trim()) { setError("誤答を3つ入力してください"); return; }
    onSave({
      sentence: sentence.trim(),
      japaneseText: japaneseText.trim(),
      answer: answer.trim(),
      wrongChoices: [wrong1.trim(), wrong2.trim(), wrong3.trim()],
      explanation: explanation.trim(),
      genre,
    });
  };

  const inputCls = "w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm";
  const labelCls = "text-[10px] text-glow mb-0.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm p-5 bg-sea font-pixel max-h-[90vh] overflow-y-auto space-y-3"
        style={{ border: "4px solid var(--aqua-glow)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
      >
        <div className="font-bold text-foam text-center">
          {isNew ? "＋ 穴抜け問題を追加" : "✏️ 穴抜け問題を編集"}
        </div>
        {error && <p className="text-xs text-coral">{error}</p>}

        {[
          { label: `問題文（${PLACEHOLDER} で空欄）`, value: sentence, set: setSentence, placeholder: `例: I ${PLACEHOLDER} ${PLACEHOLDER} student` },
          { label: "日本語訳", value: japaneseText, set: setJapaneseText, placeholder: "例: 私は学生です" },
          { label: "正解（空欄を埋める語句）", value: answer, set: setAnswer, placeholder: "例: am a" },
          { label: "誤答1", value: wrong1, set: setWrong1, placeholder: "例: is an" },
          { label: "誤答2", value: wrong2, set: setWrong2, placeholder: "例: are the" },
          { label: "誤答3", value: wrong3, set: setWrong3, placeholder: "例: am an" },
          { label: "解説（任意）", value: explanation, set: setExplanation, placeholder: "例: am + a = 一人の学生" },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label}>
            <div className={labelCls}>{label}</div>
            <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className={inputCls} />
          </div>
        ))}

        <div>
          <div className={labelCls}>ジャンル</div>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value as WordGenre)}
            className={inputCls}
          >
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-white/10 text-dim text-sm font-bold">
            キャンセル
          </button>
          <button onClick={submit} className="flex-1 py-2 rounded-xl bg-glow text-deep text-sm font-bold">
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- メインビュー ----
export default function BlankQuestionView() {
  const game = useGame();
  const { blankQuestions, blankQuestionStats } = game;
  const genres = useMemo(() => {
    const set = new Set(blankQuestions.map((q) => q.genre ?? "未分類"));
    return ["未分類", ...Array.from(set).filter((g) => g !== "未分類").sort()];
  }, [blankQuestions]);

  const [showForm, setShowForm] = useState(false);
  const [editingQ, setEditingQ] = useState<BlankQuestion | null>(null);
  const [filterGenre, setFilterGenre] = useState<WordGenre | "すべて">("すべて");
  const [csvError, setCsvError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const displayed = useMemo(
    () => filterGenre === "すべて" ? blankQuestions : blankQuestions.filter((q) => (q.genre ?? "未分類") === filterGenre),
    [blankQuestions, filterGenre]
  );

  const downloadTemplate = () => {
    const bom = "﻿";
    const sample = "文,日本語訳,正解,誤答1,誤答2,誤答3,解説,ジャンル\nI 〈〉 〈〉 student,私は学生です,am a,is an,are the,am an,am + a で「私は一人の学生」,文法";
    const blob = new Blob([bom + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blank_questions_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    Papa.parse<string[]>(file, {
      encoding: "UTF-8",
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.filter((r) => {
          const first = (r[0] ?? "").replace(/^﻿/, "").trim();
          return first !== "文" && first !== "";
        });
        const parsed: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">[] = [];
        const errors: string[] = [];
        rows.forEach((cols, i) => {
          if (cols.length < 6) { errors.push(`行${i + 2}: 列が足りません`); return; }
          const sentence = cols[0].replace(/^﻿/, "").trim();
          const [, japaneseText, answer, w1, w2, w3, explanation = "", genre = "未分類"] = cols;
          if (!sentence.includes(PLACEHOLDER)) { errors.push(`行${i + 2}: 〈〉がありません`); return; }
          parsed.push({
            sentence: sentence.trim(),
            japaneseText: japaneseText.trim(),
            answer: answer.trim(),
            wrongChoices: [w1.trim(), w2.trim(), w3.trim()],
            explanation: explanation.trim(),
            genre: genre.trim() || "未分類",
          });
        });
        if (errors.length > 0) { setCsvError(errors.slice(0, 3).join(" / ")); return; }
        game.importBlankQuestions(parsed);
        setCsvError(`${parsed.length}件を取り込みました`);
      },
      error: () => setCsvError("CSVの読み込みに失敗しました"),
    });
  };

  const handleSave = (data: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">) => {
    if (editingQ) {
      game.updateBlankQuestion({ ...editingQ, ...data, lastUpdated: Date.now() });
      setEditingQ(null);
    } else {
      game.addBlankQuestion(data);
      setShowForm(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-foam">
          穴抜け問題
          <span className="text-xs text-dim ml-2">{blankQuestions.length}問</span>
        </h2>
        <button
          onClick={() => { setShowForm(true); setEditingQ(null); }}
          className="text-xs px-3 py-1.5 rounded-xl bg-glow text-deep font-bold"
        >
          ＋ 追加
        </button>
      </div>

      {/* CSV操作 */}
      <div className="flex gap-2">
        <button onClick={downloadTemplate} className="flex-1 text-xs py-2 rounded-xl bg-mid text-foam font-bold">
          📥 CSVテンプレ
        </button>
        <label className="flex-1 text-xs py-2 rounded-xl bg-mid text-foam font-bold text-center cursor-pointer">
          📤 CSV取り込み
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} />
        </label>
      </div>
      {csvError && <p className="text-xs text-center text-glow">{csvError}</p>}

      {/* ジャンルフィルター */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {(["すべて", ...genres] as const).map((g) => (
          <button
            key={g}
            onClick={() => setFilterGenre(g)}
            className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap font-bold shrink-0 ${
              filterGenre === g ? "bg-sand text-deep" : "bg-white/10 text-dim"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* 問題一覧 */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {displayed.length === 0 && (
          <p className="text-xs text-dim text-center mt-8">
            {blankQuestions.length === 0
              ? "問題がまだありません。「＋ 追加」か CSV で登録してね"
              : "このジャンルの問題はありません"}
          </p>
        )}
        {displayed.map((q) => {
          const s = blankQuestionStats[q.id];
          return (
            <div key={q.id} className="rounded-xl bg-mid p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foam font-bold">{q.sentence.replace(/〈〉/g, `[${q.answer}]`)}</div>
                <div className="text-[10px] text-dim mt-0.5">{q.japaneseText}</div>
                {q.explanation && (
                  <div className="text-[10px] text-glow/70 mt-0.5">💡 {q.explanation}</div>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-dim">
                    {q.genre ?? "未分類"}
                  </span>
                  {s?.incorrectCount ? (
                    <span className="text-[10px] text-coral">⚠️ 苦手 {s.incorrectCount}回</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={() => { setEditingQ(q); setShowForm(false); }}
                  className="text-[10px] text-dim px-2 py-1 rounded-lg bg-white/10"
                >
                  編集
                </button>
                <button
                  onClick={() => game.removeBlankQuestion(q.id)}
                  className="text-[10px] text-coral px-2 py-1 rounded-lg bg-coral/10"
                >
                  削除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <QuestionForm
          initial={{ genre: filterGenre !== "すべて" ? filterGenre : "未分類" }}
          isNew={true}
          genres={genres}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* 編集フォーム */}
      {editingQ && (
        <QuestionForm
          initial={editingQ}
          isNew={false}
          genres={genres}
          onSave={handleSave}
          onClose={() => setEditingQ(null)}
        />
      )}
    </div>
  );
}
