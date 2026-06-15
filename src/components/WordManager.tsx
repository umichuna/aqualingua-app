"use client";

// 単語帳ビュー
// - フィルター: レベル・ジャンル・種別（複数選択可）
// - 検索・並び替え
// - 単語詳細モーダル（すべての意味・複数例文+日本語訳）
// - 登録フォーム（複数意味+ボタン、複数例文、種別ラジオ）
// - CSV一括登録

import { useMemo, useRef, useState } from "react";
import { parseVocabularyCsv, type CsvImportResult } from "@/lib/csv";
import { speak } from "@/lib/speech";
import { DEFAULT_GENRES, type Word, type WordExample, type WordGenre, type WordLevel, type WordType } from "@/lib/types";
import { useGame } from "./GameProvider";

const BASE_GENRES: WordGenre[] = [...DEFAULT_GENRES];
const LEVELS: WordLevel[] = ["1", "2", "3", "4", "5"];
const WORD_TYPES: WordType[] = ["単語", "述語", "会話文"];
const LEVEL_LABEL: Record<WordLevel, string> = {
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
};
const LEVEL_ORDER: Record<WordLevel, number> = {
  "1": 0, "2": 1, "3": 2, "4": 3, "5": 4,
};

type SortKey = "alpha" | "date" | "level" | "weak";
const SORT_LABELS: Record<SortKey, string> = {
  alpha: "アルファベット順", date: "登録日", level: "レベル", weak: "苦手順",
};

// 後方互換: examples が未定義なら exampleSentence から生成
function getExamples(w: Word): WordExample[] {
  if (w.examples && w.examples.length > 0) return w.examples;
  if (w.exampleSentence)
    return [{ sentence: w.exampleSentence, translation: w.exampleTranslation }];
  return [];
}

// ─── モジュールスコープの小部品 ───────────────────────────────────────────

// プルダウン式フィルター（クリックでチェックボックス一覧を開閉・複数選択可）
function FilterDropdown<T extends string>({
  label, options, selected, open, onOpenToggle, onToggle, optionLabel,
}: {
  label: string;
  options: T[];
  selected: Set<T>;
  open: boolean;
  onOpenToggle: () => void;
  onToggle: (val: T) => void;
  optionLabel?: (val: T) => string;
}) {
  return (
    <div className="flex-1 min-w-0 relative">
      <button
        onClick={onOpenToggle}
        className={`w-full text-xs px-2 py-1.5 rounded-lg font-bold border flex items-center justify-center gap-1 ${
          selected.size > 0
            ? "bg-sand text-deep border-sand"
            : "bg-white/5 text-dim border-white/10"
        }`}
      >
        <span className="truncate">
          {label}
          {selected.size > 0 && `(${selected.size})`}
        </span>
        <span className="shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg bg-mid border border-white/10 shadow-lg p-2 space-y-1">
          {options.map((o) => (
            <label
              key={o}
              className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer active:bg-white/10"
            >
              <input
                type="checkbox"
                checked={selected.has(o)}
                onChange={() => onToggle(o)}
                className="accent-sand shrink-0"
              />
              <span className={`text-xs ${selected.has(o) ? "text-foam font-bold" : "text-dim"}`}>
                {optionLabel ? optionLabel(o) : o}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Tag({ label, color = "dim" }: { label: string; color?: string }) {
  const cls: Record<string, string> = {
    dim: "bg-white/10 text-dim",
    sand: "bg-sand/20 text-sand",
    glow: "bg-glow/20 text-glow",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cls[color] ?? cls.dim}`}>
      {label}
    </span>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────

export default function WordManager() {
  const game = useGame();
  const { words, wordStats } = game;
  const GENRES: WordGenre[] = useMemo(
    () => [...BASE_GENRES, ...(game.user.customGenres ?? [])],
    [game.user.customGenres]
  );

  const [selGenres, setSelGenres] = useState<Set<WordGenre>>(new Set());
  const [selLevels, setSelLevels] = useState<Set<WordLevel>>(new Set());
  const [selTypes, setSelTypes] = useState<Set<WordType>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [openFilter, setOpenFilter] = useState<"level" | "type" | "genre" | null>(null);

  const [selectedWord, setSelectedWord] = useState<Word | null>(null); // 詳細モーダル
  const [editing, setEditing] = useState<Word | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<Word | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [selWords, setSelWords] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleSet = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  const displayed = useMemo(() => {
    let pool = words;
    if (selGenres.size > 0) pool = pool.filter((w) => selGenres.has(w.genre));
    if (selLevels.size > 0) pool = pool.filter((w) => selLevels.has(w.level));
    if (selTypes.size > 0) pool = pool.filter((w) => selTypes.has(w.wordType));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      pool = pool.filter(
        (w) =>
          w.spelling.toLowerCase().includes(q) ||
          w.meanings.some((m) => m.toLowerCase().includes(q))
      );
    }
    return [...pool].sort((a, b) => {
      switch (sort) {
        case "alpha": return a.spelling.localeCompare(b.spelling, "en");
        case "date": return b.lastUpdated - a.lastUpdated;
        case "level": return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
        case "weak":
          return (
            (wordStats[b.id]?.incorrectCount ?? 0) -
            (wordStats[a.id]?.incorrectCount ?? 0)
          );
      }
    });
  }, [words, selGenres, selLevels, selTypes, query, sort, wordStats]);

  const onCsvFile = async (file: File) => {
    const text = await file.text();
    setCsvPreview(parseVocabularyCsv(text, game.user.customGenres ?? []));
  };

  const confirmImport = async () => {
    if (!csvPreview) return;
    setImporting(true);
    const allWords = csvPreview.words;
    const chunks: Word[][] = [];
    for (let i = 0; i < allWords.length; i += 50)
      chunks.push(allWords.slice(i, i + 50));
    let done = 0;
    for (const chunk of chunks) {
      game.saveWords(chunk);
      done += chunk.length;
      setImportProgress(Math.round((done / allWords.length) * 100));
      await new Promise((r) => setTimeout(r, 50));
    }
    setImporting(false);
    setImportProgress(0);
    game.pushNotice("📄", `${allWords.length}件の単語を取り込んだ！`);
    setCsvPreview(null);
  };

  const blankWord = (): Word => ({
    id: crypto.randomUUID(),
    spelling: "",
    wordType: "単語",
    meanings: [],
    exampleSentence: "",
    exampleTranslation: "",
    examples: [],
    level: "1",
    genre: "日常会話",
    lastUpdated: Date.now(),
  });

  const activeFilters = selGenres.size + selLevels.size + selTypes.size > 0;

  return (
    <div className="p-3 flex flex-col gap-2 h-full">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between gap-1">
        <h2 className="font-bold text-base text-foam shrink-0">
          単語帳 <span className="text-xs text-dim">{words.length}語</span>
        </h2>
        <div className="flex gap-1 flex-wrap justify-end">
          <a
            href="https://docs.google.com/spreadsheets/d/1sYUiAKLQmz3IWaPnV25V-wxTnNMrYf5ylgklbgkhvvg/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1.5 rounded-lg font-bold bg-white/10 text-dim"
          >
            📥 テンプレ
          </a>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs px-2 py-1.5 rounded-lg font-bold bg-glow text-deep"
          >
            📄 CSV取込
          </button>
          <button
            onClick={() => { setEditing(blankWord()); setIsNew(true); }}
            className="text-xs px-2 py-1.5 rounded-lg font-bold bg-white/10 text-foam"
          >
            ＋追加
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onCsvFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* 検索バー */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 スペル・意味で検索…"
        className="w-full px-3 py-2 rounded-xl bg-mid text-foam text-sm outline-none placeholder:text-dim"
      />

      {/* フィルター（プルダウン式・複数選択可） */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <FilterDropdown
            label="レベル"
            options={LEVELS}
            selected={selLevels}
            open={openFilter === "level"}
            onOpenToggle={() => setOpenFilter(openFilter === "level" ? null : "level")}
            onToggle={(l) => setSelLevels(toggleSet(selLevels, l))}
            optionLabel={(l) => LEVEL_LABEL[l]}
          />
          <FilterDropdown
            label="種別"
            options={WORD_TYPES}
            selected={selTypes}
            open={openFilter === "type"}
            onOpenToggle={() => setOpenFilter(openFilter === "type" ? null : "type")}
            onToggle={(t) => setSelTypes(toggleSet(selTypes, t))}
          />
          <FilterDropdown
            label="ジャンル"
            options={GENRES}
            selected={selGenres}
            open={openFilter === "genre"}
            onOpenToggle={() => setOpenFilter(openFilter === "genre" ? null : "genre")}
            onToggle={(g) => setSelGenres(toggleSet(selGenres, g))}
          />
        </div>
        {activeFilters && (
          <button
            onClick={() => { setSelGenres(new Set()); setSelLevels(new Set()); setSelTypes(new Set()); }}
            className="text-[10px] text-coral underline"
          >
            絞り込みをリセット
          </button>
        )}
      </div>

      {/* 並び替え */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        <span className="text-[10px] text-dim shrink-0">並び替え:</span>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap font-bold shrink-0 ${
              sort === k ? "bg-sand text-deep" : "bg-white/10 text-dim"
            }`}
          >
            {SORT_LABELS[k]}
          </button>
        ))}
      </div>

      {/* 件数 + 一括操作バー */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-dim">
          {displayed.length === words.length
            ? `${words.length}語`
            : `${displayed.length} / ${words.length}語`}
        </div>
        <div className="flex items-center gap-2">
          {selWords.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="text-[10px] px-2 py-1 rounded font-bold bg-coral text-white"
            >
              {selWords.size}件削除
            </button>
          )}
          {displayed.length > 0 && (
            <button
              onClick={() => {
                if (selWords.size === displayed.length) {
                  setSelWords(new Set());
                } else {
                  setSelWords(new Set(displayed.map((w) => w.id)));
                }
              }}
              className="text-[10px] px-2 py-1 rounded font-bold bg-white/10 text-dim"
            >
              {selWords.size === displayed.length ? "全解除" : "全選択"}
            </button>
          )}
        </div>
      </div>

      {/* 単語リスト */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {displayed.length === 0 && (
          <div className="text-center text-xs text-dim pt-8">
            {words.length === 0
              ? "単語がまだないよ。CSV取込か「＋追加」から登録してね"
              : "条件に一致する単語がありません"}
          </div>
        )}
        {displayed.map((w, idx) => {
          const miss = wordStats[w.id]?.incorrectCount ?? 0;
          const checked = selWords.has(w.id);
          return (
            <div
              key={w.id}
              className={`rounded-xl p-3 cursor-pointer transition-colors ${checked ? "bg-sand/20 border border-sand/40" : "bg-mid active:bg-white/10"}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    e.stopPropagation();
                    const next = new Set(selWords);
                    if (checked) next.delete(w.id); else next.add(w.id);
                    setSelWords(next);
                  }}
                  className="shrink-0 w-4 h-4 accent-sand"
                />
                <span className="text-[10px] text-dim shrink-0 w-6 text-right">{idx + 1}</span>
                <div
                  className="min-w-0 flex-1 flex items-center justify-between gap-2"
                  onClick={() => setSelectedWord(w)}
                >
                  <div className="min-w-0">
                    <span className="font-bold text-foam">{w.spelling}</span>
                    <span className="text-xs ml-2 text-dim truncate">
                      {w.meanings.length > 0 ? w.meanings[0] : "（意味未登録）"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {miss > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-coral/20 text-coral">
                        ✕{miss}
                      </span>
                    )}
                    <Tag label={`Lv.${w.level}`} color="sand" />
                    <Tag label={w.genre} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── 詳細モーダル ─── */}
      {selectedWord && (
        <WordDetailModal
          word={selectedWord}
          onEdit={() => { setEditing({ ...selectedWord }); setIsNew(false); setSelectedWord(null); }}
          onDelete={() => { setDeleting(selectedWord); setSelectedWord(null); }}
          onClose={() => setSelectedWord(null)}
        />
      )}

      {/* CSVプレビュー */}
      {csvPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70">
          <div
            className="w-full max-w-sm p-5 bg-sea font-pixel max-h-[80vh] overflow-y-auto"
            style={{ border: "4px solid var(--aqua-glow)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
          >
            <div className="font-bold text-foam mb-3 text-center">📄 CSV取り込みプレビュー</div>
            <div className="space-y-1.5 text-sm mb-3">
              <div className="flex justify-between px-3 py-2 bg-black/30">
                <span className="text-dim">取り込み可能</span>
                <span className="font-bold text-glow">{csvPreview.words.length}件</span>
              </div>
              {csvPreview.unknownGenres.length > 0 && (
                <div className="px-3 py-2 bg-black/30 text-xs border border-sand/40">
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-sand">⚠ 未登録のジャンル</span>
                    <span className="font-bold text-sand">{csvPreview.pendingWords.length}件</span>
                  </div>
                  <div className="text-foam mb-2">
                    {csvPreview.unknownGenres.map((g) => `「${g}」`).join(" ")} は登録されていません。追加しますか？
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        game.addCustomGenres(csvPreview.unknownGenres);
                        setCsvPreview({
                          ...csvPreview,
                          words: [...csvPreview.words, ...csvPreview.pendingWords],
                          pendingWords: [],
                          unknownGenres: [],
                        });
                      }}
                      className="flex-1 py-1 text-xs font-bold bg-sand text-deep"
                    >
                      ジャンルを追加
                    </button>
                    <button
                      onClick={() => setCsvPreview({ ...csvPreview, pendingWords: [], unknownGenres: [] })}
                      className="flex-1 py-1 text-xs font-bold bg-white/10 text-dim"
                    >
                      スキップ
                    </button>
                  </div>
                </div>
              )}
              {csvPreview.errors.length > 0 && (
                <div className="px-3 py-2 bg-black/30 text-xs">
                  <div className="flex justify-between">
                    <span className="text-dim">エラー行</span>
                    <span className="font-bold text-coral">{csvPreview.errors.length}件</span>
                  </div>
                  {csvPreview.errors.slice(0, 5).map((e) => (
                    <div key={e.row} className="text-coral mt-0.5">
                      {e.row}行目: {e.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {importing ? (
              <div>
                <div className="h-3 rounded-full overflow-hidden bg-black/40 mb-1">
                  <div className="h-full bg-glow transition-all" style={{ width: `${importProgress}%` }} />
                </div>
                <div className="text-center text-xs text-dim">{importProgress}%</div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setCsvPreview(null)} className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim">
                  キャンセル
                </button>
                <button
                  onClick={() => void confirmImport()}
                  disabled={csvPreview.words.length === 0}
                  className={`flex-1 py-2 text-sm font-bold ${csvPreview.words.length > 0 ? "bg-glow text-deep" : "bg-white/10 text-dim"}`}
                >
                  取り込む
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 追加・編集フォーム */}
      {editing && (
        <WordForm
          word={editing}
          isNew={isNew}
          genres={GENRES}
          onSave={(w) => {
            game.saveWord(w);
            setEditing(null);
            game.pushNotice("📚", isNew ? `「${w.spelling}」を追加した！` : `「${w.spelling}」を更新した！`);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 削除確認 */}
      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70"
          onClick={() => setDeleting(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs p-5 text-center bg-sea font-pixel"
            style={{ border: "4px solid var(--aqua-coral)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
          >
            <div className="font-bold text-foam mb-1">「{deleting.spelling}」を削除する？</div>
            <div className="text-xs text-dim mb-4">学習履歴も消えるよ</div>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim">
                やめておく
              </button>
              <button
                onClick={() => { game.removeWord(deleting.id); setDeleting(null); }}
                className="flex-1 py-2 text-sm font-bold bg-coral text-deep"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一括削除確認ダイアログ */}
      {bulkDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70"
          onClick={() => setBulkDeleteConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs p-5 text-center bg-sea font-pixel"
            style={{ border: "4px solid var(--aqua-coral)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
          >
            <div className="text-2xl mb-1">🗑️</div>
            <div className="font-bold text-foam mb-1">{selWords.size}件削除しますか？</div>
            <div className="text-xs text-dim mb-4">学習履歴もまとめて消えるよ</div>
            <div className="flex gap-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim"
              >
                いいえ
              </button>
              <button
                onClick={() => {
                  selWords.forEach((id) => game.removeWord(id));
                  setSelWords(new Set());
                  setBulkDeleteConfirm(false);
                }}
                className="flex-1 py-2 text-sm font-bold bg-coral text-deep"
              >
                はい、削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 単語詳細モーダル ─────────────────────────────────────────────────────

function WordDetailModal({
  word, onEdit, onDelete, onClose,
}: {
  word: Word;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const examples = getExamples(word);
  const registeredDate = new Date(word.lastUpdated).toLocaleDateString("ja-JP", {
    year: "numeric", month: "numeric", day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-sea font-pixel rounded-2xl max-h-[85vh] flex flex-col"
        style={{ border: "2px solid var(--aqua-glow)" }}
      >
        {/* ヘッダー（戻る・編集・削除） */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <button onClick={onClose} className="text-dim text-sm font-bold active:text-foam">
            ← とじる
          </button>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="text-sm px-3 py-1 rounded-lg bg-white/10 text-foam font-bold active:scale-95 transition-transform"
            >
              ✏️ 編集
            </button>
            <button
              onClick={onDelete}
              className="text-sm px-3 py-1 rounded-lg bg-coral/20 text-coral font-bold active:scale-95 transition-transform"
            >
              🗑
            </button>
          </div>
        </div>

        {/* 本文（スクロール可） */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* 単語スペル + 読み上げ */}
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-foam">{word.spelling}</span>
            <button
              onClick={() => void speak(word.spelling)}
              className="text-xl active:scale-90 transition-transform"
              title="読み上げ"
            >
              🔊
            </button>
          </div>

          {/* 1番目の意味（大きく） */}
          {word.meanings.length > 0 && (
            <div className="text-lg text-sand font-bold">{word.meanings[0]}</div>
          )}

          {/* タグ（種別・Lv・ジャンル） */}
          <div className="flex gap-1.5 flex-wrap">
            <Tag label={word.wordType} />
            <Tag label={`Lv.${word.level}`} color="sand" />
            <Tag label={word.genre} color="glow" />
          </div>

          <div className="border-t border-white/10" />

          {/* すべての意味 */}
          {word.meanings.length > 0 && (
            <div>
              <div className="text-xs font-bold text-glow mb-2">すべての意味</div>
              <ul className="space-y-1">
                {word.meanings.map((m, i) => (
                  <li key={i} className="text-sm text-foam flex items-start gap-1.5">
                    <span className="text-dim shrink-0">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 例文 */}
          {examples.length > 0 && (
            <div>
              <div className="text-xs font-bold text-glow mb-2">例文</div>
              <div className="space-y-3">
                {examples.map((ex, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-start gap-2">
                      <span className="text-dim text-xs shrink-0 mt-0.5">{i + 1}.</span>
                      <div className="flex-1">
                        <div className="text-sm text-foam">{ex.sentence}</div>
                        {ex.translation && (
                          <div className="text-xs text-dim mt-0.5">{ex.translation}</div>
                        )}
                      </div>
                      <button
                        onClick={() => void speak(ex.sentence)}
                        className="text-sm shrink-0 text-dim active:text-glow transition-colors"
                      >
                        🔊
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 登録日 */}
          <div className="border-t border-white/10 pt-3">
            <div className="text-[10px] text-dim text-center">登録日: {registeredDate}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 追加・編集フォーム ───────────────────────────────────────────────────

function WordForm({
  word, isNew, genres, onSave, onClose,
}: {
  word: Word;
  isNew: boolean;
  genres: WordGenre[];
  onSave: (w: Word) => void;
  onClose: () => void;
}) {
  const initExamples: WordExample[] =
    word.examples && word.examples.length > 0
      ? word.examples
      : word.exampleSentence
      ? [{ sentence: word.exampleSentence, translation: word.exampleTranslation }]
      : [{ sentence: "", translation: "" }];

  const [spelling, setSpelling] = useState(word.spelling);
  const [wordType, setWordType] = useState<WordType>(word.wordType);
  const [meanings, setMeanings] = useState<string[]>(
    word.meanings.length > 0 ? word.meanings : [""]
  );
  const [examples, setExamples] = useState<WordExample[]>(initExamples);
  const [level, setLevel] = useState<WordLevel>(word.level);
  const [genre, setGenre] = useState<WordGenre>(word.genre);
  const [error, setError] = useState("");
  const [aiTranslating, setAiTranslating] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [translationCandidates, setTranslationCandidates] = useState<string[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());

  const handleAiTranslate = async () => {
    const sp = spelling.trim();
    if (!sp) { setAiError("先に単語を入力してね"); setTimeout(() => setAiError(""), 2000); return; }
    setAiTranslating(true);
    setAiError("");
    setTranslationCandidates([]);
    setSelectedCandidates(new Set());
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sp }),
      });
      const data = (await res.json()) as { translations?: string[]; error?: string };
      if (!res.ok || !data.translations?.length) throw new Error(data.error ?? "エラー");
      const candidates = data.translations.slice(0, 8);
      setTranslationCandidates(candidates);
      setSelectedCandidates(new Set(candidates));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "翻訳に失敗しました");
      setTimeout(() => setAiError(""), 3000);
    } finally {
      setAiTranslating(false);
    }
  };

  const applyTranslationCandidates = () => {
    const selected = translationCandidates.filter((c) => selectedCandidates.has(c));
    if (selected.length > 0) setMeanings(selected.slice(0, 5));
    setTranslationCandidates([]);
    setSelectedCandidates(new Set());
  };

  const toggleCandidate = (c: string) => {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const handleAiGenerate = async () => {
    const sp = spelling.trim();
    if (!sp) { setAiError("先に単語を入力してね"); setTimeout(() => setAiError(""), 2000); return; }
    setAiGenerating(true);
    setAiError("");
    try {
      const cleanMeanings = meanings.map((m) => m.trim()).filter(Boolean);
      const res = await fetch("/api/generate-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spelling: sp, meanings: cleanMeanings }),
      });
      const data = (await res.json()) as {
        examples?: { sentence: string; translation: string }[];
        error?: string;
      };
      if (!res.ok || !data.examples?.length) throw new Error(data.error ?? "エラー");
      setExamples(data.examples.slice(0, 3));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "例文生成に失敗しました");
      setTimeout(() => setAiError(""), 3000);
    } finally {
      setAiGenerating(false);
    }
  };

  const updateMeaning = (i: number, val: string) =>
    setMeanings((prev) => prev.map((m, idx) => (idx === i ? val : m)));
  const addMeaning = () => {
    if (meanings.length < 5) setMeanings((prev) => [...prev, ""]);
  };
  const removeMeaning = (i: number) =>
    setMeanings((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const updateExample = (i: number, key: keyof WordExample, val: string) =>
    setExamples((prev) =>
      prev.map((ex, idx) => (idx === i ? { ...ex, [key]: val } : ex))
    );
  const addExample = () => {
    if (examples.length < 3) setExamples((prev) => [...prev, { sentence: "", translation: "" }]);
  };
  const removeExample = (i: number) =>
    setExamples((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const submit = () => {
    const sp = spelling.trim();
    if (!sp) { setError("単語（スペル）を入力してね"); return; }
    const cleanMeanings = meanings.map((m) => m.trim()).filter(Boolean);
    const cleanExamples = examples
      .map((ex) => ({ sentence: ex.sentence.trim(), translation: ex.translation.trim() }))
      .filter((ex) => ex.sentence);
    const firstEx = cleanExamples[0] ?? { sentence: "", translation: "" };
    onSave({
      ...word,
      spelling: sp,
      wordType,
      meanings: cleanMeanings,
      exampleSentence: firstEx.sentence,
      exampleTranslation: firstEx.translation,
      examples: cleanExamples,
      level,
      genre,
      lastUpdated: Date.now(),
    });
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-black/40 text-foam outline-none text-sm";
  const labelCls = "text-[10px] font-bold text-glow";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm p-5 bg-sea font-pixel max-h-[90vh] overflow-y-auto space-y-3"
        style={{ border: "4px solid var(--aqua-glow)", boxShadow: "0 0 0 4px var(--aqua-deep)" }}
      >
        {aiError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-coral/90 text-deep text-xs font-bold">
            {aiError}
          </div>
        )}

        <div className="font-bold text-foam text-center">
          {isNew ? "📚 単語を追加" : "✏️ 単語を編集"}
        </div>

        {/* 基本情報 */}
        <div>
          <div className={labelCls}>単語 / 述語 *</div>
          <input
            className={inputCls}
            value={spelling}
            onChange={(e) => setSpelling(e.target.value)}
            placeholder="例: accomplish"
          />
        </div>

        {/* 種別（ラジオボタン） */}
        <div>
          <div className={labelCls}>種別</div>
          <div className="flex gap-3 mt-1">
            {WORD_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="wordType"
                  value={t}
                  checked={wordType === t}
                  onChange={() => setWordType(t)}
                  className="accent-sand"
                />
                <span className="text-sm text-foam">{t}</span>
              </label>
            ))}
          </div>
        </div>

        {/* レベル・ジャンル */}
        <div className="flex gap-2">
          <div className="flex-1">
            <div className={labelCls}>レベル</div>
            <select
              className={inputCls}
              value={level}
              onChange={(e) => setLevel(e.target.value as WordLevel)}
            >
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <div className={labelCls}>ジャンル</div>
            <select
              className={inputCls}
              value={genre}
              onChange={(e) => setGenre(e.target.value as WordGenre)}
            >
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        {/* 意味（複数入力） */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className={labelCls}>意味</div>
            <button
              onClick={() => void handleAiTranslate()}
              disabled={aiTranslating}
              className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-dim font-bold disabled:opacity-40"
            >
              {aiTranslating ? "翻訳中…" : "✨ AI翻訳"}
            </button>
          </div>
          <div className="space-y-1.5">
            {meanings.map((m, i) => (
              <div key={i} className="flex gap-1">
                <input
                  className={`${inputCls} flex-1`}
                  value={m}
                  onChange={(e) => updateMeaning(i, e.target.value)}
                  placeholder="意味を入力"
                />
                {meanings.length > 1 && (
                  <button
                    onClick={() => removeMeaning(i)}
                    className="text-coral text-xs px-2 py-1 rounded-lg bg-coral/10 font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {meanings.length < 5 && (
              <button
                onClick={addMeaning}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-dim font-bold w-full"
              >
                ＋ 意味を追加
              </button>
            )}
          </div>
          {/* AI翻訳 候補選択パネル */}
          {translationCandidates.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-black/30 space-y-2">
              <div className="text-[10px] text-glow font-bold">翻訳候補（使いたいものを選んで「適用」）</div>
              <div className="flex flex-wrap gap-1.5">
                {translationCandidates.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleCandidate(c)}
                    className={`text-xs px-2.5 py-1 rounded-full font-bold border transition-colors ${
                      selectedCandidates.has(c)
                        ? "bg-sand text-deep border-sand"
                        : "bg-white/5 text-dim border-white/10"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setTranslationCandidates([]); setSelectedCandidates(new Set()); }}
                  className="flex-1 py-1 text-xs font-bold bg-white/10 text-dim rounded"
                >
                  キャンセル
                </button>
                <button
                  onClick={applyTranslationCandidates}
                  disabled={selectedCandidates.size === 0}
                  className="flex-1 py-1 text-xs font-bold bg-glow text-deep rounded disabled:opacity-40"
                >
                  適用する（{selectedCandidates.size}件）
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 例文（複数・最大3件） */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className={labelCls}>例文（最大3件）</div>
            <button
              onClick={() => void handleAiGenerate()}
              disabled={aiGenerating}
              className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-dim font-bold disabled:opacity-40"
            >
              {aiGenerating ? "生成中…" : "✨ AI生成"}
            </button>
          </div>
          <div className="space-y-2.5">
            {examples.map((ex, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dim shrink-0">例文{i + 1}</span>
                  {examples.length > 1 && (
                    <button
                      onClick={() => removeExample(i)}
                      className="ml-auto text-[10px] text-coral font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
                <input
                  className={inputCls}
                  value={ex.sentence}
                  onChange={(e) => updateExample(i, "sentence", e.target.value)}
                  placeholder="英文を入力…"
                />
                <input
                  className={inputCls}
                  value={ex.translation}
                  onChange={(e) => updateExample(i, "translation", e.target.value)}
                  placeholder="日本語訳を入力…"
                />
              </div>
            ))}
            {examples.length < 3 && (
              <button
                onClick={addExample}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-dim font-bold w-full"
              >
                ＋ 例文を追加
              </button>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-coral">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim">
            キャンセル
          </button>
          <button onClick={submit} className="flex-1 py-2 text-sm font-bold bg-glow text-deep">
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}
