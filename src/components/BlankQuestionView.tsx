"use client";

// 穴抜け問題ビュー
// - 問題一覧・追加・CSV一括インポート・4択クイズ出題
// - 〈〉プレースホルダーを選択肢で埋める形式

import { useMemo, useState } from "react";
import type { BlankQuestion } from "@/lib/types";
import { useGame } from "./GameProvider";

const PLACEHOLDER = "〈〉";

// CSV: 文,日本語訳,正解,誤答1,誤答2,誤答3,解説
const CSV_HEADER = "文,日本語訳,正解,誤答1,誤答2,誤答3,解説";

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

// ---- クイズ画面 ----
function QuizPlay({
  questions,
  stats,
  onRecord,
  onFinish,
}: {
  questions: BlankQuestion[];
  stats: Record<string, { incorrectCount: number }>;
  onRecord: (id: string, correct: boolean) => void;
  onFinish: (score: number, total: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const q = questions[idx];
  const choices = useMemo(
    () => (q ? shuffle([q.answer, ...q.wrongChoices]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx]
  );

  if (!q) return null;
  const isCorrect = picked === q.answer;

  const next = () => {
    if (idx + 1 >= questions.length) {
      onFinish(score + (isCorrect ? 1 : 0), questions.length);
    } else {
      setIdx(idx + 1);
      setPicked(null);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex justify-between text-xs text-dim">
        <span>{idx + 1} / {questions.length}</span>
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
                if (ok) setScore((s) => s + 1);
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
          {idx + 1 >= questions.length ? "結果を見る" : "次へ →"}
        </button>
      )}
    </div>
  );
}

// ---- メインビュー ----
export default function BlankQuestionView() {
  const game = useGame();
  const { blankQuestions, blankQuestionStats } = game;

  const [phase, setPhase] = useState<"list" | "play" | "done">("list");
  const [quizQuestions, setQuizQuestions] = useState<BlankQuestion[]>([]);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [weakOnly, setWeakOnly] = useState(false);
  const [form, setForm] = useState({
    sentence: "",
    japaneseText: "",
    answer: "",
    wrong1: "",
    wrong2: "",
    wrong3: "",
    explanation: "",
  });
  const [formError, setFormError] = useState("");
  const [csvError, setCsvError] = useState("");

  const weakIds = useMemo(
    () => new Set(Object.entries(blankQuestionStats).filter(([, s]) => s.incorrectCount > 0).map(([id]) => id)),
    [blankQuestionStats]
  );

  const displayList = weakOnly
    ? blankQuestions.filter((q) => weakIds.has(q.id))
    : blankQuestions;

  const startQuiz = () => {
    const pool = weakOnly ? blankQuestions.filter((q) => weakIds.has(q.id)) : blankQuestions;
    if (pool.length === 0) return;
    setQuizQuestions(shuffle(pool));
    setPhase("play");
  };

  const submitAdd = () => {
    const { sentence, japaneseText, answer, wrong1, wrong2, wrong3 } = form;
    if (!sentence.includes(PLACEHOLDER)) { setFormError(`文に ${PLACEHOLDER} を含めてください`); return; }
    if (!japaneseText.trim()) { setFormError("日本語訳を入力してください"); return; }
    if (!answer.trim()) { setFormError("正解を入力してください"); return; }
    if (!wrong1.trim() || !wrong2.trim() || !wrong3.trim()) { setFormError("誤答を3つ入力してください"); return; }
    game.addBlankQuestion({
      sentence: sentence.trim(),
      japaneseText: japaneseText.trim(),
      answer: answer.trim(),
      wrongChoices: [wrong1.trim(), wrong2.trim(), wrong3.trim()],
      explanation: form.explanation.trim(),
    });
    setForm({ sentence: "", japaneseText: "", answer: "", wrong1: "", wrong2: "", wrong3: "", explanation: "" });
    setShowAdd(false);
    setFormError("");
  };

  const downloadTemplate = () => {
    const bom = "﻿";
    const sample = `${CSV_HEADER}\nI 〈〉 〈〉 student,私は学生です,am a,is an,are the,am an,am + a で「私は一人の学生」`;
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string).replace(/^﻿/, "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("文,"));
      const parsed: Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated">[] = [];
      const errors: string[] = [];
      lines.forEach((line, i) => {
        const cols = line.split(",");
        if (cols.length < 6) { errors.push(`行${i + 2}: 列が足りません`); return; }
        const [sentence, japaneseText, answer, w1, w2, w3, explanation = ""] = cols;
        if (!sentence.includes(PLACEHOLDER)) { errors.push(`行${i + 2}: 〈〉がありません`); return; }
        parsed.push({
          sentence: sentence.trim(),
          japaneseText: japaneseText.trim(),
          answer: answer.trim(),
          wrongChoices: [w1.trim(), w2.trim(), w3.trim()],
          explanation: explanation.trim(),
        });
      });
      if (errors.length > 0) { setCsvError(errors.slice(0, 3).join(" / ")); return; }
      game.importBlankQuestions(parsed);
      setCsvError(`${parsed.length}件を取り込みました`);
    };
    reader.readAsText(file, "utf-8");
  };

  // ---- 出題中 ----
  if (phase === "play") {
    return (
      <QuizPlay
        questions={quizQuestions}
        stats={blankQuestionStats}
        onRecord={game.recordBlankAnswer}
        onFinish={(score, total) => { setResult({ score, total }); setPhase("done"); }}
      />
    );
  }

  // ---- 結果 ----
  if (phase === "done" && result) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full gap-4">
        <div className="text-5xl">🎉</div>
        <div className="font-bold text-xl text-foam">{result.score} / {result.total} 正解！</div>
        <button
          onClick={() => { setPhase("list"); setResult(null); }}
          className="px-6 py-3 rounded-xl font-bold bg-glow text-deep active:scale-95"
        >
          一覧に戻る
        </button>
      </div>
    );
  }

  // ---- 一覧 ----
  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-foam">
          穴抜け問題
          <span className="text-xs text-dim ml-2">{blankQuestions.length}問</span>
        </h2>
        <button
          onClick={() => { setShowAdd(!showAdd); setFormError(""); }}
          className="text-xs px-3 py-1.5 rounded-xl bg-glow text-deep font-bold"
        >
          ＋ 追加
        </button>
      </div>

      {/* 追加フォーム */}
      {showAdd && (
        <div className="rounded-2xl bg-mid p-4 flex flex-col gap-2">
          <div className="text-xs font-bold text-foam">新しい穴抜け問題</div>
          {formError && <p className="text-xs text-coral">{formError}</p>}

          {[
            { key: "sentence", label: `問題文（${PLACEHOLDER} で空欄）`, placeholder: `例: I ${PLACEHOLDER} ${PLACEHOLDER} student` },
            { key: "japaneseText", label: "日本語訳", placeholder: "例: 私は学生です" },
            { key: "answer", label: "正解（空欄を埋める語句）", placeholder: "例: am a" },
            { key: "wrong1", label: "誤答1", placeholder: "例: is an" },
            { key: "wrong2", label: "誤答2", placeholder: "例: are the" },
            { key: "wrong3", label: "誤答3", placeholder: "例: am an" },
            { key: "explanation", label: "解説（任意）", placeholder: "例: am + a = 一人の学生" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <div className="text-[10px] text-glow mb-0.5">{label}</div>
              <input
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm"
              />
            </div>
          ))}

          <div className="flex gap-2 mt-1">
            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl bg-white/10 text-dim text-sm font-bold">
              キャンセル
            </button>
            <button onClick={submitAdd} className="flex-1 py-2 rounded-xl bg-glow text-deep text-sm font-bold">
              追加する
            </button>
          </div>
        </div>
      )}

      {/* CSV操作 */}
      <div className="flex gap-2">
        <button onClick={downloadTemplate} className="flex-1 text-xs py-2 rounded-xl bg-mid text-foam font-bold">
          📥 CSVテンプレ
        </button>
        <label className="flex-1 text-xs py-2 rounded-xl bg-mid text-foam font-bold text-center cursor-pointer">
          📤 CSV取り込み
          <input type="file" accept=".csv" className="hidden" onChange={importCsv} />
        </label>
      </div>
      {csvError && <p className="text-xs text-center text-glow">{csvError}</p>}

      {/* 絞り込み＋出題ボタン */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeakOnly(!weakOnly)}
          className={`text-xs px-3 py-1.5 rounded-full font-bold ${weakOnly ? "bg-coral text-deep" : "bg-white/10 text-dim"}`}
        >
          ⚠️ 苦手のみ（{weakIds.size}問）
        </button>
        <button
          onClick={startQuiz}
          disabled={displayList.length === 0}
          className="ml-auto text-xs px-4 py-1.5 rounded-xl bg-sand text-deep font-bold disabled:opacity-40"
        >
          ▶ 出題（{displayList.length}問）
        </button>
      </div>

      {/* 問題一覧 */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {displayList.length === 0 && (
          <p className="text-xs text-dim text-center mt-8">
            問題がまだありません。「＋ 追加」か CSV で登録してね
          </p>
        )}
        {displayList.map((q) => {
          const s = blankQuestionStats[q.id];
          return (
            <div key={q.id} className="rounded-xl bg-mid p-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foam font-bold">{q.sentence.replace(/〈〉/g, `[${q.answer}]`)}</div>
                <div className="text-[10px] text-dim mt-0.5">{q.japaneseText}</div>
                {s?.incorrectCount ? (
                  <div className="text-[10px] text-coral mt-0.5">⚠️ 苦手 {s.incorrectCount}回</div>
                ) : null}
              </div>
              <button
                onClick={() => game.removeBlankQuestion(q.id)}
                className="text-[10px] text-dim px-2 py-1 rounded-lg bg-white/10 shrink-0"
              >
                削除
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
