"use client";

// 魚画像表示（public/fish/{imageId}.png を表示）
// 病気時は彩度を落として表現、未発見は黒塗り

import { getFishMaster } from "@/data/fishMaster";


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
