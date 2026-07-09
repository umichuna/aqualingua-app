// CSV取り込み（vocabulary_template 形式）
// 列: 単語,種別,ジャンル,レベル,意味1,意味2,意味3,例文1,例文2,例文3

import Papa from "papaparse";
import type { BlankQuestion, Word, WordGenre, WordLevel, WordType } from "./types";

export interface CsvRowError {
  row: number; // 1始まり（ヘッダー除く）
  reason: string;
}

export interface CsvImportResult {
  words: Word[]; // 取り込み可能な単語
  pendingWords: Word[]; // 未知ジャンルを含む単語（ユーザー確認後に追加）
  unknownGenres: string[]; // CSV内に登録されていないジャンル名（重複なし）
  errors: CsvRowError[];
  hasIdColumn: boolean; // 「書き出し」CSVの再取込（id列あり=往復編集・削除反映対象）かどうか
}

function mapLevel(raw: string): WordLevel | null {
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n)) {
    if (n >= 1 && n <= 5) return n.toString() as WordLevel;
    return null;
  }
  if (["1", "2", "3", "4", "5"].includes(raw)) {
    return raw as WordLevel;
  }
  return null;
}

const GENRE_ALIASES: Record<string, WordGenre> = {
  日常: "日常会話",
  日常会話: "日常会話",
  ビジネス: "ビジネス",
  旅行: "旅行",
  ニュース: "ニュース",
  "趣味・カルチャー": "趣味・カルチャー",
  趣味: "趣味・カルチャー",
  カルチャー: "趣味・カルチャー",
};

export function parseVocabularyCsv(
  csvText: string,
  knownGenres: string[] = []
): CsvImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const result: CsvImportResult = {
    words: [],
    pendingWords: [],
    unknownGenres: [],
    errors: [],
    hasIdColumn: (parsed.meta.fields ?? []).includes("id"),
  };
  const unknownGenreSet = new Set<string>();

  parsed.data.forEach((row, i) => {
    const rowNo = i + 1;
    const spelling = (row["単語"] ?? "").trim();
    if (!spelling) {
      result.errors.push({ row: rowNo, reason: "「単語」列が空" });
      return;
    }

    const rawGenre = (row["ジャンル"] ?? "").trim();
    const mappedGenre = GENRE_ALIASES[rawGenre];
    const isKnownCustom = knownGenres.includes(rawGenre);
    const genre: WordGenre | undefined = mappedGenre ?? (isKnownCustom ? rawGenre : undefined);

    const level = mapLevel((row["レベル"] ?? "").trim());
    if (!level) {
      result.errors.push({
        row: rowNo,
        reason: `レベル「${row["レベル"] ?? ""}」が不明（1〜5で指定）`,
      });
      return;
    }
    const wordType: WordType =
      (row["種別"] ?? "").trim() === "述語" ? "述語" : "単語";

    const meanings = [row["意味1"], row["意味2"], row["意味3"]]
      .map((m) => (m ?? "").trim())
      .filter(Boolean);
    // 例文と訳をペアで取り込む（訳列があれば往復編集で保持される）
    const exampleParts = [
      { s: (row["例文1"] ?? "").trim(), t: (row["訳1"] ?? "").trim() },
      { s: (row["例文2"] ?? "").trim(), t: (row["訳2"] ?? "").trim() },
      { s: (row["例文3"] ?? "").trim(), t: (row["訳3"] ?? "").trim() },
    ].filter((e) => e.s);

    // id 列があれば保持（エクスポート→編集→取り込みで既存を上書き更新するため）
    const existingId = (row["id"] ?? "").trim();

    const word: Word = {
      id: existingId || crypto.randomUUID(),
      spelling,
      wordType,
      meanings,
      exampleSentence: exampleParts[0]?.s ?? "",
      exampleTranslation: exampleParts[0]?.t ?? "",
      examples: exampleParts.map((e) => ({ sentence: e.s, translation: e.t })),
      level,
      genre: genre ?? rawGenre,
      lastUpdated: Date.now(),
    };

    if (!genre) {
      // 未知ジャンル → 保留リストへ
      unknownGenreSet.add(rawGenre);
      result.pendingWords.push(word);
    } else {
      result.words.push(word);
    }
  });

  result.unknownGenres = Array.from(unknownGenreSet);
  return result;
}

// 単語をCSV文字列に変換（エクスポート用）。
// id 列を含むため、編集して取り込むと既存単語を上書き更新できる（往復編集）。
// 列: id,単語,種別,ジャンル,レベル,意味1..3,例文1..3,訳1..3
export function wordsToCsv(words: Word[]): string {
  const rows = words.map((w) => {
    const examples =
      w.examples && w.examples.length > 0
        ? w.examples
        : w.exampleSentence
        ? [{ sentence: w.exampleSentence, translation: w.exampleTranslation ?? "" }]
        : [];
    return {
      id: w.id,
      単語: w.spelling,
      種別: w.wordType,
      ジャンル: w.genre,
      レベル: w.level,
      意味1: w.meanings[0] ?? "",
      意味2: w.meanings[1] ?? "",
      意味3: w.meanings[2] ?? "",
      例文1: examples[0]?.sentence ?? "",
      例文2: examples[1]?.sentence ?? "",
      例文3: examples[2]?.sentence ?? "",
      訳1: examples[0]?.translation ?? "",
      訳2: examples[1]?.translation ?? "",
      訳3: examples[2]?.translation ?? "",
    };
  });
  const columns = [
    "id", "単語", "種別", "ジャンル", "レベル",
    "意味1", "意味2", "意味3",
    "例文1", "例文2", "例文3",
    "訳1", "訳2", "訳3",
  ];
  return Papa.unparse({ fields: columns, data: rows });
}

// 穴抜け問題をCSV文字列に変換（編集用・往復編集対応）。
// id 列を含むため、編集して再取込すると id 一致で既存問題を更新できる
// （id 列が無い「追加用CSV」は常に新規追加のみ）。
// 列: id,文,日本語訳,正解,誤答1,誤答2,誤答3,解説,ジャンル
export function blankQuestionsToCsv(questions: BlankQuestion[]): string {
  const rows = questions.map((q) => ({
    id: q.id,
    文: q.sentence,
    日本語訳: q.japaneseText,
    正解: q.answer,
    誤答1: q.wrongChoices[0] ?? "",
    誤答2: q.wrongChoices[1] ?? "",
    誤答3: q.wrongChoices[2] ?? "",
    解説: q.explanation ?? "",
    ジャンル: q.genre ?? "未分類",
  }));
  const columns = ["id", "文", "日本語訳", "正解", "誤答1", "誤答2", "誤答3", "解説", "ジャンル"];
  return Papa.unparse({ fields: columns, data: rows });
}

const PLACEHOLDER = "〈〉";

// パース済みの穴抜け問題行。id が空文字なら新規追加、非空なら既存id照合の対象。
export type ParsedBlankQuestionRow = Omit<BlankQuestion, "id" | "createdAt" | "lastUpdated"> & { id: string };

export interface BlankCsvParseResult {
  rows: ParsedBlankQuestionRow[];
  errors: CsvRowError[];
  hasIdColumn: boolean; // 「編集用CSV」（id列あり=往復編集・削除反映対象）かどうか
}

// 穴抜け問題CSVを取り込む（ヘッダー行方式）。
// id 列は「追加用CSV」（新規テンプレ）には無く、「編集用CSV」（書き出し）には有る。
// どちらの形式でも読めるよう、id 列が無ければ空文字として扱う（＝常に新規追加になる）。
export function parseBlankQuestionsCsv(csvText: string): BlankCsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const hasIdColumn = (parsed.meta.fields ?? []).includes("id");

  const rows: ParsedBlankQuestionRow[] = [];
  const errors: CsvRowError[] = [];

  parsed.data.forEach((row, i) => {
    const rowNo = i + 1;
    const sentence = (row["文"] ?? "").replace(/^﻿/, "").trim();
    if (!sentence) { errors.push({ row: rowNo, reason: "「文」列が空" }); return; }
    if (!sentence.includes(PLACEHOLDER)) { errors.push({ row: rowNo, reason: `「文」に ${PLACEHOLDER} がありません` }); return; }
    const japaneseText = (row["日本語訳"] ?? "").trim();
    const answer = (row["正解"] ?? "").trim();
    const w1 = (row["誤答1"] ?? "").trim();
    const w2 = (row["誤答2"] ?? "").trim();
    const w3 = (row["誤答3"] ?? "").trim();
    if (!japaneseText || !answer || !w1 || !w2 || !w3) {
      errors.push({ row: rowNo, reason: "日本語訳・正解・誤答1〜3のいずれかが空" });
      return;
    }
    rows.push({
      id: (row["id"] ?? "").trim(),
      sentence,
      japaneseText,
      answer,
      wrongChoices: [w1, w2, w3],
      explanation: (row["解説"] ?? "").trim(),
      genre: (row["ジャンル"] ?? "").trim() || "未分類",
    });
  });

  return { rows, errors, hasIdColumn };
}
