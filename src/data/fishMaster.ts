// 魚マスターデータ
// レア度・基準価格は UIプロトタイプ v0.2 の RARITY 定義（仕様書§4.2と一致）を流用

import type { Rarity } from "@/lib/types";

export interface RarityInfo {
  color: string;
  base: number; // 出荷の基準額（G）
  gachaWeight: number; // ガチャ排出の重み（%）
}

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  激安: { color: "#9DB4C0", base: 100, gachaWeight: 50 },
  普通: { color: "#5BC0EB", base: 600, gachaWeight: 35 },
  高級: { color: "#F2D88F", base: 2200, gachaWeight: 13 },
  ロマン: { color: "#F2705B", base: 15000, gachaWeight: 2 },
};

// PixelFish の配色パレット
export interface FishPalette {
  body: string;
  stripe: string;
  fin: string;
  eye: string;
}

export interface FishMaster {
  type: string; // 種類名（図鑑のキー）
  rarity: Rarity;
  palette: FishPalette;
  description: string; // 図鑑の説明文
  imageId?: string; // public/fish/{imageId}.png が存在する場合はそちらを表示
}

// ★ 魚の追加方法 ★
// 下の配列にオブジェクトを1つ追加するだけで、ガチャ・図鑑・水槽すべてに自動で反映される。
//   type:        種類名（図鑑のキー。他とかぶらないこと）
//   rarity:      "激安" | "普通" | "高級" | "ロマン"（ガチャ排出率と出荷額が決まる）
//   palette:     ドット絵の配色。body=体、stripe=しま模様、fin=ヒレ、eye=目
//   description: 図鑑に表示される説明文
// 例:
// {
//   type: "ミナミハコフグ",
//   rarity: "普通",
//   palette: { body: "#F2D028", stripe: "#1B1B1B", fin: "#E0B81F", eye: "#1B1B1B" },
//   description: "黄色いサイコロのような体がかわいい。",
// },
export const FISH_MASTER: FishMaster[] = [
  // ---- 激安 ----
  {
    type: "デバスズメダイ",
    rarity: "激安",
    palette: { body: "#7FD9D0", stripe: "#BFF0EB", fin: "#4FB3A9", eye: "#1B1B1B" },
    description: "群れで泳ぐのが大好きな、さわやかな水色の小魚。",
  },
  {
    type: "ロイヤルデムワーゼル",
    rarity: "激安",
    palette: { body: "#4A6FE3", stripe: "#F2D88F", fin: "#3D5BC4", eye: "#1B1B1B" },
    description: "青い体に黄色いしっぽがおしゃれなスズメダイ。",
  },
  {
    type: "キンギョハナダイ",
    rarity: "激安",
    palette: { body: "#F2913D", stripe: "#F7B975", fin: "#E3702A", eye: "#1B1B1B" },
    description: "オレンジ色がまぶしい、サンゴ礁の人気者。",
  },
  // ---- 普通 ----
  {
    type: "カクレクマノミ",
    rarity: "普通",
    palette: { body: "#F2862C", stripe: "#FFFFFF", fin: "#D96704", eye: "#1B1B1B" },
    description: "イソギンチャクに隠れて暮らす、みんなのアイドル。",
  },
  {
    type: "ハタタテハゼ",
    rarity: "普通",
    palette: { body: "#F5EFE0", stripe: "#F2705B", fin: "#E8D9B0", eye: "#1B1B1B" },
    description: "背びれをピンと立てて泳ぐ姿がかわいいハゼ。",
  },
  {
    type: "チョウチョウウオ",
    rarity: "普通",
    palette: { body: "#F2D028", stripe: "#1B1B1B", fin: "#E0B81F", eye: "#1B1B1B" },
    description: "ちょうちょのようにひらひら泳ぐ黄色い魚。",
  },
  // ---- 高級 ----
  {
    type: "ナンヨウハギ",
    rarity: "高級",
    palette: { body: "#2D6FD9", stripe: "#10264D", fin: "#F2D028", eye: "#1B1B1B" },
    description: "鮮やかな青と黄色のしっぽ。映画でも大人気。",
    imageId: "ナンヨウハギ",
  },
  {
    type: "フレームエンゼル",
    rarity: "高級",
    palette: { body: "#E3402A", stripe: "#7A1B10", fin: "#F26B3A", eye: "#1B1B1B" },
    description: "炎のように真っ赤な体が美しい高級魚。",
  },
  {
    type: "マンダリンフィッシュ",
    rarity: "高級",
    palette: { body: "#2A9D8F", stripe: "#F2913D", fin: "#264653", eye: "#1B1B1B" },
    description: "サイケデリックな模様を持つ、海の宝石。",
  },
  // ---- 激安（イラストあり） ----
  {
    type: "ナマコ",
    rarity: "激安",
    palette: { body: "#8B4513", stripe: "#A0522D", fin: "#6B3410", eye: "#1B1B1B" },
    description: "海の底をのんびり歩く、掃除屋さん。",
    imageId: "ナマコ",
  },
  {
    type: "ハゼ",
    rarity: "激安",
    palette: { body: "#C8A878", stripe: "#E0C89A", fin: "#A88E60", eye: "#1B1B1B" },
    description: "砂地に穴を掘って暮らす、小さなアイドル。",
    imageId: "ハゼ",
  },
  // ---- 普通（イラストあり） ----
  {
    type: "ウツボ",
    rarity: "普通",
    palette: { body: "#6B8C42", stripe: "#8BAD5A", fin: "#4A6B30", eye: "#1B1B1B" },
    description: "岩の穴から顔を出す、ちょっとこわい見た目の魚。",
    imageId: "ウツボ",
  },
  {
    type: "ハシナガチョウチョウウオ",
    rarity: "普通",
    palette: { body: "#F5EFD0", stripe: "#1B1B1B", fin: "#F2D028", eye: "#1B1B1B" },
    description: "細長い口でサンゴのすき間をつつく、おしゃれな魚。",
    imageId: "ハシナガチョウチョウウオ",
  },
  {
    type: "カレイ",
    rarity: "普通",
    palette: { body: "#C8A060", stripe: "#A07840", fin: "#E0B880", eye: "#1B1B1B" },
    description: "砂に隠れる名人。目が両方同じ側についている不思議な魚。",
    imageId: "カレイ",
  },
  {
    type: "コウイカ",
    rarity: "普通",
    palette: { body: "#8090A0", stripe: "#B0C0D0", fin: "#607080", eye: "#1B1B1B" },
    description: "体の模様を自在に変える、海のカメレオン。",
    imageId: "コウイカ",
  },
  {
    type: "タツノオトシゴ",
    rarity: "普通",
    palette: { body: "#C8A030", stripe: "#E0C050", fin: "#A08020", eye: "#1B1B1B" },
    description: "しっぽで海草に巻きつく、ゆっくり泳ぐ不思議な生き物。",
    imageId: "タツノオトシゴ",
  },
  {
    type: "ツノダシ",
    rarity: "普通",
    palette: { body: "#F5EFD0", stripe: "#1B1B1B", fin: "#F2D028", eye: "#1B1B1B" },
    description: "黒と白の縞に黄色いしっぽが目を引く、三角形の体の魚。",
    imageId: "ツノダシ",
  },
  {
    type: "ハリセンボン",
    rarity: "普通",
    palette: { body: "#D4B870", stripe: "#1B1B1B", fin: "#B89850", eye: "#1B1B1B" },
    description: "危険を感じるとふくらんでトゲを立てる、まん丸な魚。",
    imageId: "ハリセンボン",
  },
  {
    type: "カサゴ",
    rarity: "普通",
    palette: { body: "#C04030", stripe: "#A02820", fin: "#D06040", eye: "#1B1B1B" },
    description: "岩に擬態して獲物を待つ、底生の赤い魚。",
    imageId: "カサゴ",
  },
  {
    type: "タツノオトシゴ2",
    rarity: "普通",
    palette: { body: "#F2913D", stripe: "#F7B975", fin: "#D97020", eye: "#1B1B1B" },
    description: "オレンジ色が美しい、タツノオトシゴの仲間。",
    imageId: "タツノオトシゴ2",
  },
  {
    type: "ナブカ",
    rarity: "普通",
    palette: { body: "#C8B090", stripe: "#8B6B50", fin: "#A89070", eye: "#1B1B1B" },
    description: "小型で温厚なサメの一種。底をのんびり歩く姿が愛らしい。",
    imageId: "ナブカ",
  },
  {
    type: "マダイ",
    rarity: "普通",
    palette: { body: "#E07090", stripe: "#C05070", fin: "#F090A0", eye: "#1B1B1B" },
    description: "めでたい席に欠かせない、日本人が愛する赤い魚。",
    imageId: "マダイ",
  },
  // ---- 高級（イラストあり） ----
  {
    type: "ハナミノカサゴ",
    rarity: "高級",
    palette: { body: "#C83020", stripe: "#F0F0F0", fin: "#E05030", eye: "#1B1B1B" },
    description: "ヒレを広げた姿が美しいが、毒トゲを持つ危険な魚。",
    imageId: "ハナミノカサゴ",
  },
  {
    type: "オオモンハゲブダイ",
    rarity: "高級",
    palette: { body: "#2080C0", stripe: "#40A0E0", fin: "#1060A0", eye: "#1B1B1B" },
    description: "サンゴをかじって砂に変えてしまう、パワフルな魚。",
    imageId: "オオモンハゲブダイ",
  },
  {
    type: "ニシキテグリ",
    rarity: "高級",
    palette: { body: "#20A090", stripe: "#F2913D", fin: "#1B6B60", eye: "#1B1B1B" },
    description: "極彩色の模様が美しい、世界一きれいな魚とも呼ばれる。",
    imageId: "ニシキテグリ",
  },
  {
    type: "カブトガニ",
    rarity: "高級",
    palette: { body: "#5C4020", stripe: "#3C2810", fin: "#7C5830", eye: "#1B1B1B" },
    description: "2億年前から姿が変わらない、生きた化石。",
    imageId: "カブトガニ",
  },
  {
    type: "ハナヒゲウツボ",
    rarity: "高級",
    palette: { body: "#2040C0", stripe: "#F2D028", fin: "#1030A0", eye: "#1B1B1B" },
    description: "青い体と黄色い口が鮮やかな、美しいウツボの仲間。",
    imageId: "ハナヒゲウツボ",
  },
  // ---- ロマン（イラストあり） ----
  {
    type: "シュモクザメ",
    rarity: "ロマン",
    palette: { body: "#7090A0", stripe: "#F0F0F0", fin: "#506880", eye: "#1B1B1B" },
    description: "ハンマーのような形の頭を持つ、謎多きサメ。",
    imageId: "シュモクザメ",
  },
  {
    type: "ホホジロザメ",
    rarity: "ロマン",
    palette: { body: "#708090", stripe: "#F5F5F5", fin: "#506070", eye: "#1B1B1B" },
    description: "海の頂点に立つ最強のハンター。出会えたら一生の思い出。",
    imageId: "ホホジロザメ",
  },
  {
    type: "オウムガイ",
    rarity: "ロマン",
    palette: { body: "#F5DEB3", stripe: "#C8A060", fin: "#E0C090", eye: "#1B1B1B" },
    description: "らせん状の殻に隠れて暮らす、古代から生き続ける奇跡の生き物。",
    imageId: "オウムガイ",
  },
  {
    type: "ジュゴン",
    rarity: "ロマン",
    palette: { body: "#A0B8C0", stripe: "#C0D0D8", fin: "#8098A8", eye: "#1B1B1B" },
    description: "人魚のモデルとも言われる、温かい海の大型海洋哺乳類。",
    imageId: "ジュゴン",
  },
  {
    type: "リーフィーシードラゴン",
    rarity: "ロマン",
    palette: { body: "#80A040", stripe: "#A0C060", fin: "#608030", eye: "#1B1B1B" },
    description: "葉っぱのような体で海草に隠れる、世界一美しい魚の一つ。",
    imageId: "リーフィーシードラゴン",
  },
  // ---- ロマン ----
  {
    type: "ナポレオンフィッシュ",
    rarity: "ロマン",
    palette: { body: "#4FB3A9", stripe: "#2A7D74", fin: "#37C8C3", eye: "#1B1B1B" },
    description: "額のコブが立派な、サンゴ礁の王様。",
  },
  {
    type: "リュウグウノツカイ",
    rarity: "ロマン",
    palette: { body: "#D9E3F0", stripe: "#F2705B", fin: "#F2705B", eye: "#1B1B1B" },
    description: "深海からの使者。出会えたら奇跡といわれる伝説の魚。",
  },
];

export function getFishMaster(type: string): FishMaster | undefined {
  return FISH_MASTER.find((f) => f.type === type);
}

// 任意の重みテーブルでガチャ排出（tiersごとに異なる重みを渡す）
export function rollGachaWithWeights(
  weights: Record<Rarity, number>
): FishMaster {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  let rarity: Rarity = "激安";
  for (const [key, w] of Object.entries(weights) as [Rarity, number][]) {
    roll -= w;
    if (roll <= 0) {
      rarity = key;
      break;
    }
  }
  const pool = FISH_MASTER.filter((f) => f.rarity === rarity);
  if (pool.length === 0) {
    // ロマンが0重みの激安ガチャ等でPoolが空になった場合のフォールバック
    return FISH_MASTER[Math.floor(Math.random() * FISH_MASTER.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// 後方互換: スタンダードガチャ（旧RARITY_INFOのgachaWeight）
export function rollGacha(): FishMaster {
  const weights: Record<Rarity, number> = {
    激安: RARITY_INFO.激安.gachaWeight,
    普通: RARITY_INFO.普通.gachaWeight,
    高級: RARITY_INFO.高級.gachaWeight,
    ロマン: RARITY_INFO.ロマン.gachaWeight,
  };
  return rollGachaWithWeights(weights);
}
