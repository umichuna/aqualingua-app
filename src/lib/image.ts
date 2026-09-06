// 画像をアプリ内に保存できるサイズまで確実に圧縮するための共通処理。
//
// 背景画像やカスタム魚の画像は base64 文字列として userStatus に入り、
// クラウド保存では userStatus ごと1リクエストで送られる。Vercel のリクエスト上限は
// 4.5MB のため、画像が大きいと保存そのものが 413（送信データが大きすぎる）で失敗する。
// 実際に背景画像1枚で 2.41MB になり、クラウド保存が止まる事故が起きた。
//
// 以前の実装は横幅しか見ておらず（`Math.min(MAX_WIDTH / img.width, 1)`）、
// 縦に長い画像は縮小されずそのまま巨大な JPEG になっていた。
// ここでは縦横の両方を抑えたうえで、目標バイト数に収まるまで品質と寸法を段階的に落とす。

// 水槽の背景画像1枚あたりの上限（base64 文字列としての長さの目安）。
// 水槽は最大10槽まで増やせるため、1枚あたりの上限 × 10 が送信サイズを圧迫しない値にする。
// 250KB × 10槽 = 約2.5MB。ここに単語・記録などが乗っても 4.5MB の上限内に収まる。
export const MAX_BACKGROUND_BASE64_BYTES = 250_000;

// カスタム魚1匹あたりの画像の上限。カスタム魚は何匹でも増やせるため、
// 1匹あたりを小さく保たないと送信サイズがすぐ膨らむ。
// 実際に「カスタム魚の画像だけで 2.4MB」になり保存できなくなる事故が起きた。
export const MAX_FISH_IMAGE_BASE64_BYTES = 60_000;

/** base64 データURLのおおよそのバイト数（文字列長で十分な精度） */
export function base64ByteLength(dataUrl: string): number {
  return dataUrl?.length ?? 0;
}

// 魚の画像は水槽の背景に重ねて表示するため透過を保つ必要があり、JPEG は使えない。
// WebP は透過を保ったまま PNG よりずっと小さくできるので、使えるなら WebP を使う。
let webpSupported: boolean | null = null;
function supportsWebp(): boolean {
  if (webpSupported !== null) return webpSupported;
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    webpSupported = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function draw(img: HTMLImageElement, scale: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を変換できませんでした");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 画像を「最大辺 maxEdge 以内」かつ「maxBytes 以内」の JPEG(base64) に圧縮する。
 * 品質 → 寸法の順に落として目標に近づけ、それでも入らない場合は最後の結果を返す。
 */
export async function compressImageToBase64(
  source: File | string,
  { maxEdge = 1280, maxBytes = MAX_BACKGROUND_BASE64_BYTES }: { maxEdge?: number; maxBytes?: number } = {}
): Promise<string> {
  const dataUrl = typeof source === "string" ? source : await fileToDataUrl(source);
  const img = await loadImage(dataUrl);

  // 縦横の両方を maxEdge 以内に収める（拡大はしない）
  let scale = Math.min(maxEdge / img.width, maxEdge / img.height, 1);

  let out = draw(img, scale, 0.8);
  if (base64ByteLength(out) <= maxBytes) return out;

  // まず品質を落とす
  for (const quality of [0.7, 0.6, 0.5]) {
    out = draw(img, scale, quality);
    if (base64ByteLength(out) <= maxBytes) return out;
  }

  // それでも大きければ寸法を段階的に縮める
  for (let i = 0; i < 4; i++) {
    scale *= 0.75;
    out = draw(img, scale, 0.6);
    if (base64ByteLength(out) <= maxBytes) return out;
  }

  // 目標に届かなくても、元より小さくはなっているので最後の結果を返す
  return out;
}

function drawTransparent(img: HTMLImageElement, scale: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を変換できませんでした");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // WebP は透過を保ったまま小さくできる。未対応環境では PNG（透過あり・非圧縮寄り）に落とす。
  return supportsWebp() ? canvas.toDataURL("image/webp", quality) : canvas.toDataURL("image/png");
}

/**
 * 魚の画像を、透過を保ったまま「最大辺 maxEdge 以内」かつ「maxBytes 以内」に圧縮する。
 * WebP が使えない環境では PNG のまま寸法だけで詰めるため、目標に届かないことがある。
 */
export async function compressFishImageToBase64(
  source: File | string,
  { maxEdge = 256, maxBytes = MAX_FISH_IMAGE_BASE64_BYTES }: { maxEdge?: number; maxBytes?: number } = {}
): Promise<string> {
  const dataUrl = typeof source === "string" ? source : await fileToDataUrl(source);
  const img = await loadImage(dataUrl);

  let scale = Math.min(maxEdge / img.width, maxEdge / img.height, 1);
  let out = drawTransparent(img, scale, 0.85);
  if (base64ByteLength(out) <= maxBytes) return out;

  if (supportsWebp()) {
    for (const quality of [0.75, 0.65, 0.55]) {
      out = drawTransparent(img, scale, quality);
      if (base64ByteLength(out) <= maxBytes) return out;
    }
  }

  // それでも大きい場合は寸法を落とす（PNG しか使えない環境ではこれが主な手段）
  for (let i = 0; i < 4; i++) {
    scale *= 0.75;
    out = drawTransparent(img, scale, 0.65);
    if (base64ByteLength(out) <= maxBytes) return out;
  }
  return out;
}

/**
 * 既に保存されている魚の画像が大きすぎる場合だけ圧縮し直す。
 * @returns 圧縮した場合は新しい base64、変更不要・失敗時は null
 */
export async function shrinkFishImageIfTooLarge(
  base64: string | undefined,
  maxBytes = MAX_FISH_IMAGE_BASE64_BYTES
): Promise<string | null> {
  if (!base64 || base64ByteLength(base64) <= maxBytes) return null;
  try {
    const compressed = await compressFishImageToBase64(base64, { maxBytes });
    return base64ByteLength(compressed) < base64ByteLength(base64) ? compressed : null;
  } catch {
    return null;
  }
}

/**
 * 既に保存されている背景画像が大きすぎる場合だけ圧縮し直す。
 * 上限内ならそのまま返す（無駄な再エンコードで画質を落とさないため）。
 * @returns 圧縮した場合は新しい base64、変更不要なら null
 */
export async function shrinkIfTooLarge(
  base64: string | undefined,
  maxBytes = MAX_BACKGROUND_BASE64_BYTES
): Promise<string | null> {
  if (!base64 || base64ByteLength(base64) <= maxBytes) return null;
  try {
    const compressed = await compressImageToBase64(base64, { maxBytes });
    // 圧縮して逆に大きくなった場合は使わない
    return base64ByteLength(compressed) < base64ByteLength(base64) ? compressed : null;
  } catch {
    return null;
  }
}
