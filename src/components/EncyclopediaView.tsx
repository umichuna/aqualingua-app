"use client";

// 図鑑ビュー
// - 発見済みの魚は実物表示、未発見はシルエット表示
// - 発見済みの魚をタップ → 歴代おさかな一覧モーダル（出荷・逃走した記録 + 現在水槽にいる魚）

import { useState } from "react";
import { RARITY_INFO, RARITY_STARS } from "@/data/fishMaster";
import { todayString } from "@/lib/gameLogic";
import type { FishHistoryEntry, Rarity } from "@/lib/types";
import { useGame } from "./GameProvider";
import PixelFish from "./PixelFish";

const RARITY_ORDER: Record<Rarity, number> = {
  激安: 0,
  普通: 1,
  高級: 2,
  ロマン: 3,
};

function formatDate(dateStr: string): string {
  const today = todayString();
  const [y, m, d] = dateStr.split("-").map(Number);
  const todayParts = today.split("-").map(Number);
  const yearLabel = y !== todayParts[0] ? `${y}/` : "";
  return `${yearLabel}${m}/${d}`;
}

function FishHistoryModal({
  fishType,
  currentNames,
  entries,
  onClose,
}: {
  fishType: string;
  currentNames: string[];
  entries: FishHistoryEntry[];
  onClose: () => void;
}) {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const hasAny = currentNames.length > 0 || sorted.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-sea font-pixel rounded-2xl max-h-[70vh] flex flex-col"
        style={{ border: "2px solid var(--aqua-glow)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="font-bold text-foam text-sm">
            📖 {fishType} の歴代おさかな
          </div>
          <button onClick={onClose} className="text-dim text-sm font-bold active:text-foam">
            とじる
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {!hasAny && (
            <p className="text-xs text-dim text-center py-4">
              まだ出会いの記録がないよ。<br />出荷や逃走があると記録されるよ！
            </p>
          )}

          {/* 現在水槽にいる魚 */}
          {currentNames.map((name) => (
            <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
              <span className="text-base">🐠</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-foam">{name}</div>
                <div className="text-[10px] text-glow">現在 水槽にいる</div>
              </div>
            </div>
          ))}

          {/* 過去の魚（出荷・逃走） */}
          {sorted.map((h) => (
            <div key={h.entryId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
              <span className="text-base">{h.reason === "shipped" ? "📦" : "🌊"}</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-foam">{h.name}</div>
                <div className="text-[10px] text-dim">
                  {formatDate(h.date)}　{h.reason === "shipped" ? "出荷" : "海へ帰った"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EncyclopediaView() {
  const { encyclopedia, fishHistory, fishList, allFishMaster } = useGame();
  const discovered = new Set(encyclopedia.map((e) => e.fishType));
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const selectedEntries = selectedType
    ? fishHistory.filter((h) => h.fishType === selectedType)
    : [];
  const selectedCurrentNames = selectedType
    ? fishList.filter((f) => f.type === selectedType).map((f) => f.name)
    : [];

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      <h2 className="font-bold text-lg text-foam">
        おさかな図鑑{" "}
        <span className="text-xs text-dim">
          {discovered.size} / {allFishMaster.length} 種 発見
        </span>
      </h2>
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">
        {[...allFishMaster]
          .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0))
          .map((f) => {
            const found = discovered.has(f.type);
            return (
              <div
                key={f.type}
                onClick={() => found && setSelectedType(f.type)}
                className={`rounded-xl p-3 bg-mid text-center ${found ? "cursor-pointer active:bg-white/10 transition-colors" : ""}`}
              >
                <div className="flex justify-center py-1">
                  <PixelFish type={f.type} size={56} silhouette={!found} imageUrl={f.imageUrl} />
                </div>
                <div
                  className="inline-block text-[10px] px-2 py-0.5 rounded-full font-bold mb-1"
                  style={{
                    background: found ? RARITY_INFO[f.rarity].color : "#ffffff22",
                    color: found ? "var(--aqua-deep)" : "var(--aqua-dim)",
                  }}
                >
                  {found ? RARITY_STARS[f.rarity] : "？？？"}
                </div>
                <div className="text-sm font-bold text-foam">
                  {found ? f.type : "？？？"}
                </div>
                <div className="text-[10px] text-dim mt-1 min-h-7">
                  {found ? f.description : "まだ出会っていない…"}
                </div>
                {found && (
                  <div className="text-[9px] text-glow mt-0.5">タップで記録を見る</div>
                )}
              </div>
            );
          })}
      </div>

      {selectedType && (
        <FishHistoryModal
          fishType={selectedType}
          currentNames={selectedCurrentNames}
          entries={selectedEntries}
          onClose={() => setSelectedType(null)}
        />
      )}
    </div>
  );
}
