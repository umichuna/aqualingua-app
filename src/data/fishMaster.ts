// 魚マスターデータ
// レア度・基準価格は UIプロトタイプ v0.2 の RARITY 定義（仕様書§4.2と一致）を流用
// imageId は public/fish/{imageId}.png を参照。日本語URLのスマホ非互換を避けるため fish_NNN 形式に統一。

import type { CompanionBuff, Rarity } from "@/lib/types";

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
  companionBuff?: CompanionBuff; // 相棒にしたときの効果
}

// ★ 魚の追加方法 ★
// 下の配列にオブジェクトを1つ追加するだけで、ガチャ・図鑑・水槽すべてに自動で反映される。
//   type:        種類名（図鑑のキー。他とかぶらないこと）
//   rarity:      "激安" | "普通" | "高級" | "ロマン"（ガチャ排出率と出荷額が決まる）
//   palette:     ドット絵の配色。body=体、stripe=しま模様、fin=ヒレ、eye=目
//   description: 図鑑に表示される説明文
//   imageId:     public/fish/{imageId}.png のファイル名（拡張子なし）
export const FISH_MASTER: FishMaster[] = [
  // ---- 激安 ----
  {
    type: "ナマコ",
    rarity: "激安",
    palette: { body: "#8B4513", stripe: "#A0522D", fin: "#6B3410", eye: "#1B1B1B" },
    description: "海の底をのんびり歩く、掃除屋さん。",
    imageId: "fish_032",
  },
  {
    type: "ハゼ",
    rarity: "激安",
    palette: { body: "#C8A878", stripe: "#E0C89A", fin: "#A88E60", eye: "#1B1B1B" },
    description: "砂地に穴を掘って暮らす、小さなアイドル。",
    imageId: "fish_039",
  },
  {
    type: "イワシ",
    rarity: "激安",
    palette: { body: "#A0B8C8", stripe: "#D0E0E8", fin: "#80A0B0", eye: "#1B1B1B" },
    description: "大群で海を泳ぐ、銀色に輝く小魚。まとまると大きな生き物のように見える。",
    imageId: "fish_003",
  },
  {
    type: "サバ",
    rarity: "激安",
    palette: { body: "#4080A0", stripe: "#80B0C8", fin: "#306080", eye: "#1B1B1B" },
    description: "背中の青い縞模様が美しい、身近な海の魚。",
    imageId: "fish_018",
  },
  // ---- 普通 ----
  {
    type: "ウツボ",
    rarity: "普通",
    palette: { body: "#6B8C42", stripe: "#8BAD5A", fin: "#4A6B30", eye: "#1B1B1B" },
    description: "岩の穴から顔を出す、ちょっとこわい見た目の魚。",
    imageId: "fish_004",
  },
  {
    type: "ハシナガチョウチョウウオ",
    rarity: "普通",
    palette: { body: "#F5EFD0", stripe: "#1B1B1B", fin: "#F2D028", eye: "#1B1B1B" },
    description: "細長い口でサンゴのすき間をつつく、おしゃれな魚。",
    imageId: "fish_038",
  },
  {
    type: "カレイ",
    rarity: "普通",
    palette: { body: "#C8A060", stripe: "#A07840", fin: "#E0B880", eye: "#1B1B1B" },
    description: "砂に隠れる名人。目が両方同じ側についている不思議な魚。",
    imageId: "fish_016",
  },
  {
    type: "コウイカ",
    rarity: "普通",
    palette: { body: "#8090A0", stripe: "#B0C0D0", fin: "#607080", eye: "#1B1B1B" },
    description: "体の模様を自在に変える、海のカメレオン。",
    imageId: "fish_017",
  },
  {
    type: "タツノオトシゴ",
    rarity: "普通",
    palette: { body: "#C8A030", stripe: "#E0C050", fin: "#A08020", eye: "#1B1B1B" },
    description: "しっぽで海草に巻きつく、ゆっくり泳ぐ不思議な生き物。",
    imageId: "fish_026",
    companionBuff: { type: "affection_boost", value: 1, description: "餌やりの好感度+1" },
  },
  {
    type: "ツノダシ",
    rarity: "普通",
    palette: { body: "#F5EFD0", stripe: "#1B1B1B", fin: "#F2D028", eye: "#1B1B1B" },
    description: "黒と白の縞に黄色いしっぽが目を引く、三角形の体の魚。",
    imageId: "fish_030",
  },
  {
    type: "ハリセンボン",
    rarity: "普通",
    palette: { body: "#D4B870", stripe: "#1B1B1B", fin: "#B89850", eye: "#1B1B1B" },
    description: "危険を感じるとふくらんでトゲを立てる、まん丸な魚。",
    imageId: "fish_042",
  },
  {
    type: "カサゴ",
    rarity: "普通",
    palette: { body: "#C04030", stripe: "#A02820", fin: "#D06040", eye: "#1B1B1B" },
    description: "岩に擬態して獲物を待つ、底生の赤い魚。",
    imageId: "fish_014",
  },
  {
    type: "タツノオトシゴ2",
    rarity: "普通",
    palette: { body: "#F2913D", stripe: "#F7B975", fin: "#D97020", eye: "#1B1B1B" },
    description: "オレンジ色が美しい、タツノオトシゴの仲間。",
    imageId: "fish_027",
  },
  {
    type: "ナブカ",
    rarity: "普通",
    palette: { body: "#C8B090", stripe: "#8B6B50", fin: "#A89070", eye: "#1B1B1B" },
    description: "小型で温厚なサメの一種。底をのんびり歩く姿が愛らしい。",
    imageId: "fish_031",
    companionBuff: { type: "disease_resistance", value: 0.1, description: "病気耐性+10%" },
  },
  {
    type: "マダイ",
    rarity: "普通",
    palette: { body: "#E07090", stripe: "#C05070", fin: "#F090A0", eye: "#1B1B1B" },
    description: "めでたい席に欠かせない、日本人が愛する赤い魚。",
    imageId: "fish_044",
  },
  {
    type: "ウナギ",
    rarity: "普通",
    palette: { body: "#4A3820", stripe: "#6A5838", fin: "#3A2810", eye: "#1B1B1B" },
    description: "くねくねと泳ぐ細長い体。うな重にもなる、日本の夏の味。",
    imageId: "fish_005",
  },
  {
    type: "エイ",
    rarity: "普通",
    palette: { body: "#506070", stripe: "#708090", fin: "#304050", eye: "#1B1B1B" },
    description: "平たい体で海底をひらひら泳ぐ、優雅な生き物。",
    imageId: "fish_009",
  },
  {
    type: "ウミウシ",
    rarity: "普通",
    palette: { body: "#E040A0", stripe: "#F080C0", fin: "#C02080", eye: "#1B1B1B" },
    description: "色とりどりの体で海底を歩く、貝殻のないカタツムリの仲間。",
    imageId: "fish_006",
  },
  {
    type: "ウミヘビ",
    rarity: "普通",
    palette: { body: "#508040", stripe: "#70A060", fin: "#386030", eye: "#1B1B1B" },
    description: "海の中を泳ぐヘビ。毒を持つものも多いが、動きはとても優雅。",
    imageId: "fish_008",
  },
  {
    type: "チンアナゴ",
    rarity: "普通",
    palette: { body: "#E8D080", stripe: "#C8B060", fin: "#A89040", eye: "#1B1B1B" },
    description: "砂の中から半身を出して水流に向かう、愛嬌たっぷりの小魚。",
    imageId: "fish_029",
  },
  {
    type: "ニシキベラ",
    rarity: "普通",
    palette: { body: "#40A070", stripe: "#60C090", fin: "#208050", eye: "#1B1B1B" },
    description: "緑とピンクのツートンカラーが鮮やかな、サンゴ礁のおしゃれさん。",
    imageId: "fish_035",
  },
  {
    type: "タコ",
    rarity: "普通",
    palette: { body: "#C05840", stripe: "#E07860", fin: "#A04030", eye: "#1B1B1B" },
    description: "8本の足で器用に動き、体の色まで変えられる海の知恵者。",
    imageId: "fish_025",
  },
  {
    type: "イカ",
    rarity: "普通",
    palette: { body: "#D0D8E0", stripe: "#B0B8C0", fin: "#8090A0", eye: "#1B1B1B" },
    description: "透明な体でするすると泳ぐ、10本足の海の忍者。",
    imageId: "fish_001",
  },
  {
    type: "バイカラードティーバック",
    rarity: "普通",
    palette: { body: "#8040C0", stripe: "#F2D028", fin: "#6030A0", eye: "#1B1B1B" },
    description: "上半身が紫、下半身が黄色の二色に分かれた、鮮やかな小魚。",
    imageId: "fish_036",
  },
  // ---- 高級 ----
  {
    type: "ナンヨウハギ",
    rarity: "高級",
    palette: { body: "#2D6FD9", stripe: "#10264D", fin: "#F2D028", eye: "#1B1B1B" },
    description: "鮮やかな青と黄色のしっぽ。映画でも大人気。",
    imageId: "fish_033",
    companionBuff: { type: "decay_reduction", value: 0.3, description: "放置による好感度低下-30%" },
  },
  {
    type: "ハナミノカサゴ",
    rarity: "高級",
    palette: { body: "#C83020", stripe: "#F0F0F0", fin: "#E05030", eye: "#1B1B1B" },
    description: "ヒレを広げた姿が美しいが、毒トゲを持つ危険な魚。",
    imageId: "fish_041",
    companionBuff: { type: "disease_resistance", value: 0.3, description: "病気耐性+30%（毒トゲが守る）" },
  },
  {
    type: "オオモンハゲブダイ",
    rarity: "高級",
    palette: { body: "#2080C0", stripe: "#40A0E0", fin: "#1060A0", eye: "#1B1B1B" },
    description: "サンゴをかじって砂に変えてしまう、パワフルな魚。",
    imageId: "fish_013",
  },
  {
    type: "ニシキテグリ",
    rarity: "高級",
    palette: { body: "#20A090", stripe: "#F2913D", fin: "#1B6B60", eye: "#1B1B1B" },
    description: "極彩色の模様が美しい、世界一きれいな魚とも呼ばれる。",
    imageId: "fish_034",
    companionBuff: { type: "affection_boost", value: 3, description: "餌やりの好感度+3" },
  },
  {
    type: "カブトガニ",
    rarity: "高級",
    palette: { body: "#5C4020", stripe: "#3C2810", fin: "#7C5830", eye: "#1B1B1B" },
    description: "2億年前から姿が変わらない、生きた化石。",
    imageId: "fish_015",
    companionBuff: { type: "disease_resistance", value: 0.5, description: "病気耐性+50%（古代の生命力）" },
  },
  {
    type: "ハナヒゲウツボ",
    rarity: "高級",
    palette: { body: "#2040C0", stripe: "#F2D028", fin: "#1030A0", eye: "#1B1B1B" },
    description: "青い体と黄色い口が鮮やかな、美しいウツボの仲間。",
    imageId: "fish_040",
    companionBuff: { type: "heal_speed", value: 2, description: "病気回復期間×2倍速" },
  },
  {
    type: "ウミガメ",
    rarity: "高級",
    palette: { body: "#40804A", stripe: "#608860", fin: "#306038", eye: "#1B1B1B" },
    description: "何百年も生きるとも言われる、海の長老。産卵のたびに故郷の浜に戻る。",
    imageId: "fish_007",
    companionBuff: { type: "decay_reduction", value: 0.4, description: "放置による好感度低下-40%（長命の象徴）" },
  },
  {
    type: "チョウチンアンコウ",
    rarity: "高級",
    palette: { body: "#2A1A30", stripe: "#503060", fin: "#1A0820", eye: "#80E0FF" },
    description: "暗い深海で頭の提灯を光らせて獲物をおびき寄せる、深海の奇妙な魚。",
    imageId: "fish_028",
    companionBuff: { type: "heal_speed", value: 2, description: "回復速度×2（深海の治癒力）" },
  },
  {
    type: "オオグソクムシ",
    rarity: "高級",
    palette: { body: "#607080", stripe: "#809098", fin: "#405060", eye: "#1B1B1B" },
    description: "深海に生きるダイオウグソクムシの仲間。巨大なダンゴムシのような姿が印象的。",
    imageId: "fish_011",
  },
  {
    type: "パウダーブルーサージョンフィッシュ",
    rarity: "高級",
    palette: { body: "#5BC8E8", stripe: "#1B1B1B", fin: "#F2D028", eye: "#1B1B1B" },
    description: "粉雪のような水色の体に黒いライン。インド洋のサンゴ礁に輝く美魚。",
    imageId: "fish_037",
  },
  // ---- ロマン ----
  {
    type: "シュモクザメ",
    rarity: "ロマン",
    palette: { body: "#7090A0", stripe: "#F0F0F0", fin: "#506880", eye: "#1B1B1B" },
    description: "ハンマーのような形の頭を持つ、謎多きサメ。",
    imageId: "fish_022",
    companionBuff: { type: "disease_resistance", value: 0.6, description: "病気耐性+60%" },
  },
  {
    type: "ホホジロザメ",
    rarity: "ロマン",
    palette: { body: "#708090", stripe: "#F5F5F5", fin: "#506070", eye: "#1B1B1B" },
    description: "海の頂点に立つ最強のハンター。出会えたら一生の思い出。",
    imageId: "fish_043",
    companionBuff: { type: "disease_resistance", value: 0.8, description: "病気耐性+80%（最強の免疫）" },
  },
  {
    type: "オウムガイ",
    rarity: "ロマン",
    palette: { body: "#F5DEB3", stripe: "#C8A060", fin: "#E0C090", eye: "#1B1B1B" },
    description: "らせん状の殻に隠れて暮らす、古代から生き続ける奇跡の生き物。",
    imageId: "fish_010",
    companionBuff: { type: "decay_reduction", value: 0.5, description: "放置による好感度低下-50%（殻が守る）" },
  },
  {
    type: "ジュゴン",
    rarity: "ロマン",
    palette: { body: "#A0B8C0", stripe: "#C0D0D8", fin: "#8098A8", eye: "#1B1B1B" },
    description: "人魚のモデルとも言われる、温かい海の大型海洋哺乳類。",
    imageId: "fish_021",
    companionBuff: { type: "heal_speed", value: 1, description: "病気が1日で治る（癒しの力）" },
  },
  {
    type: "リーフィーシードラゴン",
    rarity: "ロマン",
    palette: { body: "#80A040", stripe: "#A0C060", fin: "#608030", eye: "#1B1B1B" },
    description: "葉っぱのような体で海草に隠れる、世界一美しい魚の一つ。",
    imageId: "fish_047",
    companionBuff: { type: "affection_boost", value: 5, description: "餌やりの好感度+5" },
  },
  {
    type: "マンタ",
    rarity: "ロマン",
    palette: { body: "#202830", stripe: "#F0F0F0", fin: "#101820", eye: "#1B1B1B" },
    description: "翼のような大きなヒレで大海を優雅に飛ぶ、海の大型エイ。",
    imageId: "fish_045",
    companionBuff: { type: "decay_reduction", value: 0.5, description: "放置による好感度低下-50%" },
  },
  {
    type: "ジンベエザメ",
    rarity: "ロマン",
    palette: { body: "#304868", stripe: "#F0F0F0", fin: "#203050", eye: "#1B1B1B" },
    description: "世界最大の魚。巨大な口でプランクトンを吸い込む、おだやかな巨人。",
    imageId: "fish_024",
    companionBuff: { type: "tank_expansion", value: 1, description: "水槽収容数+1" },
  },
  {
    type: "マンボウ",
    rarity: "ロマン",
    palette: { body: "#A0B0C0", stripe: "#D0E0E8", fin: "#8090A0", eye: "#1B1B1B" },
    description: "体重1トンを超えることもある、世界最重量の硬骨魚。ひれで器用に泳ぐ。",
    imageId: "fish_046",
  },
  {
    type: "シャチ",
    rarity: "ロマン",
    palette: { body: "#1B1B1B", stripe: "#F5F5F5", fin: "#101010", eye: "#F5F5F5" },
    description: "海のハンターの頂点に立つ黒白の巨体。家族で暮らし、言葉を使い狩りをする。",
    imageId: "fish_020",
    companionBuff: { type: "disease_resistance", value: 0.7, description: "病気耐性+70%" },
  },
  {
    type: "シーラカンス",
    rarity: "ロマン",
    palette: { body: "#3040A0", stripe: "#6070C0", fin: "#203080", eye: "#1B1B1B" },
    description: "4億年前から生き続ける生きた化石。幻の深海魚として世界中が驚いた。",
    imageId: "fish_019",
  },
  {
    type: "イッカク",
    rarity: "ロマン",
    palette: { body: "#B0C0C8", stripe: "#D0D8E0", fin: "#90A0A8", eye: "#1B1B1B" },
    description: "頭から長い角が伸びる、ユニコーンの海版。北極海に生きる幻の海獣。",
    imageId: "fish_002",
  },
  {
    type: "シロイルカ",
    rarity: "ロマン",
    palette: { body: "#F0F4F8", stripe: "#D8E8F0", fin: "#D0DCE8", eye: "#1B1B1B" },
    description: "真っ白な体と丸い額が印象的な、「海のカナリア」とも呼ばれる歌うクジラ。",
    imageId: "fish_023",
  },
  {
    type: "オオメジロザメ",
    rarity: "ロマン",
    palette: { body: "#808898", stripe: "#C0C8D0", fin: "#606870", eye: "#1B1B1B" },
    description: "淡水にも進出できる珍しいサメ。川の奥深くまで遡上することもある大型種。",
    imageId: "fish_012",
  },
  {
    type: "三葉虫",
    rarity: "ロマン",
    palette: { body: "#806040", stripe: "#A08060", fin: "#604820", eye: "#1B1B1B" },
    description: "古生代の海に繁栄した、節足動物の先祖。5億年前の海を泳いだ生き物。",
    imageId: "fish_048",
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
