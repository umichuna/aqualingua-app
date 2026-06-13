// オンボーディング時に投入するサンプル単語（UI補完 #16）

import type { Word } from "@/lib/types";

const SAMPLES: Omit<Word, "id" | "lastUpdated">[] = [
  {
    spelling: "grab",
    wordType: "単語",
    meanings: ["つかむ", "さっと取る"],
    exampleSentence: "Let's grab a coffee.",
    exampleTranslation: "コーヒーでも飲みに行こう。",
    examples: [
      { sentence: "Let's grab a coffee.", translation: "コーヒーでも飲みに行こう。" },
      { sentence: "She grabbed her bag and ran.", translation: "彼女はバッグをつかんで走り去った。" },
    ],
    level: "Beginner",
    genre: "日常会話",
  },
  {
    spelling: "aquarium",
    wordType: "単語",
    meanings: ["水族館", "水槽"],
    exampleSentence: "My aquarium is full of clownfish.",
    exampleTranslation: "私の水槽はカクレクマノミでいっぱいです。",
    examples: [
      { sentence: "My aquarium is full of clownfish.", translation: "私の水槽はカクレクマノミでいっぱいです。" },
      { sentence: "We visited the aquarium last weekend.", translation: "先週末、水族館に行きました。" },
    ],
    level: "Beginner",
    genre: "趣味・カルチャー",
  },
  {
    spelling: "efficient",
    wordType: "単語",
    meanings: ["効率的な"],
    exampleSentence: "We need a more efficient process.",
    exampleTranslation: "もっと効率的なプロセスが必要です。",
    examples: [
      { sentence: "We need a more efficient process.", translation: "もっと効率的なプロセスが必要です。" },
      { sentence: "She is an efficient worker.", translation: "彼女は仕事の効率がいい。" },
    ],
    level: "Intermediate",
    genre: "ビジネス",
  },
  {
    spelling: "forecast",
    wordType: "単語",
    meanings: ["予測", "予報"],
    exampleSentence: "The sales forecast looks promising.",
    exampleTranslation: "売上予測は有望に見えます。",
    examples: [
      { sentence: "The sales forecast looks promising.", translation: "売上予測は有望に見えます。" },
      { sentence: "What's the weather forecast for tomorrow?", translation: "明日の天気予報は？" },
    ],
    level: "Intermediate",
    genre: "ニュース",
  },
  {
    spelling: "itinerary",
    wordType: "単語",
    meanings: ["旅程", "旅行計画"],
    exampleSentence: "I'll send you the itinerary tonight.",
    exampleTranslation: "今夜、旅程を送りますね。",
    examples: [
      { sentence: "I'll send you the itinerary tonight.", translation: "今夜、旅程を送りますね。" },
      { sentence: "Please confirm the itinerary before booking.", translation: "予約前に旅程を確認してください。" },
    ],
    level: "Advanced",
    genre: "旅行",
  },
  {
    spelling: "accomplish",
    wordType: "単語",
    meanings: ["達成する", "成し遂げる"],
    exampleSentence: "We accomplished our goals.",
    exampleTranslation: "私たちは目標を達成した。",
    examples: [
      { sentence: "We accomplished our goals.", translation: "私たちは目標を達成した。" },
      { sentence: "She accomplished great things in her career.", translation: "彼女はキャリアで素晴らしい功績を残した。" },
      { sentence: "We need to accomplish this task by Friday.", translation: "金曜日までにこのタスクを完了する必要があります。" },
    ],
    level: "Intermediate",
    genre: "ビジネス",
  },
  {
    spelling: "turn down",
    wordType: "述語",
    meanings: ["断る", "拒否する", "音量を下げる"],
    exampleSentence: "I had to turn down the offer.",
    exampleTranslation: "その申し出を断らなければならなかった。",
    examples: [
      { sentence: "I had to turn down the offer.", translation: "その申し出を断らなければならなかった。" },
      { sentence: "Please turn down the music.", translation: "音楽の音量を下げてください。" },
    ],
    level: "Beginner",
    genre: "日常会話",
  },
  {
    spelling: "souvenir",
    wordType: "単語",
    meanings: ["おみやげ", "記念品"],
    exampleSentence: "I bought a souvenir for my family.",
    exampleTranslation: "家族におみやげを買った。",
    examples: [
      { sentence: "I bought a souvenir for my family.", translation: "家族におみやげを買った。" },
      { sentence: "This shop sells unique souvenirs.", translation: "このお店ではユニークな記念品を販売しています。" },
    ],
    level: "Beginner",
    genre: "旅行",
  },
  {
    spelling: "headline",
    wordType: "単語",
    meanings: ["見出し", "トップニュース"],
    exampleSentence: "The story made headlines around the world.",
    exampleTranslation: "そのニュースは世界中で大きく報じられた。",
    examples: [
      { sentence: "The story made headlines around the world.", translation: "そのニュースは世界中で大きく報じられた。" },
      { sentence: "I always read the headlines in the morning.", translation: "私は毎朝見出しを読みます。" },
    ],
    level: "Intermediate",
    genre: "ニュース",
  },
  {
    spelling: "masterpiece",
    wordType: "単語",
    meanings: ["傑作", "名作"],
    exampleSentence: "This movie is a true masterpiece.",
    exampleTranslation: "この映画はまさに傑作だ。",
    examples: [
      { sentence: "This movie is a true masterpiece.", translation: "この映画はまさに傑作だ。" },
      { sentence: "The painting is considered a masterpiece.", translation: "その絵画は傑作とみなされています。" },
    ],
    level: "Advanced",
    genre: "趣味・カルチャー",
  },
];

export function buildSampleWords(): Word[] {
  const now = Date.now();
  return SAMPLES.map((s) => ({ ...s, id: crypto.randomUUID(), lastUpdated: now }));
}
