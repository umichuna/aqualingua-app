"use client";

// 8x6グリッドのドット絵魚（UIプロトタイプ v0.2 の PixelFish を移植）
// imageId があれば public/fish/{imageId}.png を優先表示、なければSVGフォールバック。
// 病気のときは彩度を落として表現する（UI補完 #10）。

import { getFishMaster, type FishPalette } from "@/data/fishMaster";

const FALLBACK_PALETTE: FishPalette = {
  body: "#F2862C",
  stripe: "#FFFFFF",
  fin: "#D96704",
  eye: "#1B1B1B",
};

interface PixelFishProps {
  type: string; // fishMaster の種類名
  size?: number;
  facing?: 1 | -1;
  sick?: boolean;
  silhouette?: boolean; // 図鑑の未発見表示用
}

export default function PixelFish({
  type,
  size = 48,
  facing = 1,
  sick = false,
  silhouette = false,
}: PixelFishProps) {
  const master = getFishMaster(type);
  const p = master?.palette ?? FALLBACK_PALETTE;
  const imageId = master?.imageId;

  const cssFilter = silhouette
    ? "brightness(0) opacity(0.55)"
    : sick
      ? "saturate(0.25) brightness(0.8)"
      : undefined;

  const commonStyle = {
    transform: `scaleX(${facing})`,
    filter: cssFilter,
    display: "block",
  };

  if (imageId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/fish/${imageId}.png`}
        alt={type}
        width={size}
        height={size}
        style={commonStyle}
        className="pixelated"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 8 6"
      className="pixelated block"
      style={{ transform: `scaleX(${facing})`, filter: cssFilter }}
    >
      {/* 尾びれ */}
      <rect x="0" y="1.5" width="1" height="1" fill={p.fin} />
      <rect x="0" y="3.5" width="1" height="1" fill={p.fin} />
      <rect x="0.5" y="2.25" width="1" height="1.5" fill={p.fin} />
      {/* 胴体 */}
      <rect x="1.5" y="1.5" width="4.5" height="3" rx="0.4" fill={p.body} />
      <rect x="2.6" y="1.5" width="0.8" height="3" fill={p.stripe} />
      <rect x="4.2" y="1.5" width="0.8" height="3" fill={p.stripe} />
      {/* 背びれ */}
      <rect x="3" y="0.8" width="2" height="0.8" fill={p.fin} />
      {/* 頭・口 */}
      <rect x="6" y="2" width="1.2" height="2" rx="0.3" fill={p.body} />
      <rect x="7.1" y="2.9" width="0.5" height="0.4" fill={p.fin} />
      {/* 目 */}
      <rect x="6.2" y="2.3" width="0.5" height="0.5" fill={p.eye} />
    </svg>
  );
}
