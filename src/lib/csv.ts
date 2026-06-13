// CSV取り込み（vocabulary_template 形式）
// 列: 単語,種別,ジャンル,レベル,意味1,意味2,意味3,例文1,例文2,例文3
// 計画書のマッピング: レベル1-2=Beginner / 3=Intermediate / 4-5=Advanced、「日常」→「日常会話」

import Papa from "papaparse";
import type { Word, WordGenre, WordLevel, WordType } from "./types";

export interface CsvRowError {
  row: number; // 1始まり（ヘッダー除く）
  reason: string;
}

export interface CsvImportResult {
  words: Word[]; // 取り込み可能な単語
  duplicatesInFile: string[]; // CSV内の重複スペル
  duplicatesExisting: string[]; // 既存の単語帳と重複するスペル
  errors: CsvRowError[];
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
  existingSpellings: Set<string>
): CsvImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const result: CsvImportResult = {
    words: [],
    duplicatesInFile: [],
    duplicatesExisting: [],
    errors: [],
  };
  const seen = new Set<string>();

  parsed.data.forEach((row, i) => {
    const rowNo = i + 1;
    const spelling = (row["単語"] ?? "").trim();
    if (!spelling) {
      result.errors.push({ row: rowNo, reason: "「単語」列が空" });
      return;
    }
    const key = spelling.toLowerCase();
    if (seen.has(key)) {
      result.duplicatesInFile.push(spelling);
      return;
    }
    seen.add(key);
    if (existingSpellings.has(key)) {
      result.duplicatesExisting.push(spelling);
      return;
    }

    const genre = GENRE_ALIASES[(row["ジャンル"] ?? "").trim()];
    if (!genre) {
      result.errors.push({
        row: rowNo,
        reason: `ジャンル「${row["ジャンル"] ?? ""}」が不明`,
      });
      return;
    }
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
    const examples = [row["例文1"], row["例文2"], row["例文3"]]
      .map((e) => (e ?? "").trim())
      .filter(Boolean);

    result.words.push({
      id: crypto.randomUUID(),
      spelling,
      wordType,
      meanings,
      exampleSentence: examples[0] ?? "",
      exampleTranslation: "", // テンプレートに訳列はない。v2のAI翻訳で補完予定
      level,
      genre,
      lastUpdated: Date.now(),
    });
  });

  return result;
}
