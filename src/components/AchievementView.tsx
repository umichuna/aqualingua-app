"use client";

import { useMemo } from "react";
import { ACHIEVEMENTS, buildAchievementStats } from "@/data/achievements";
import { useGame } from "./GameProvider";
import PixelFish from "./PixelFish";

export default function AchievementView() {
  const game = useGame();
  const { user, encyclopedia, allFishMaster } = game;

  // AchievementStats を構築
  const stats = useMemo(
    () =>
      buildAchievementStats(
        user.tanks ?? [],
        user.lifetimeWordsAnswered ?? 0,
        user.lifetimeGoldEarned ?? 0,
        user.jobLevel,
        user.customFish?.length ?? 0,
        encyclopedia.filter(
          (e) =>
            allFishMaster.find((f) => f.type === e.fishType)?.rewardOnly !== true
        ).length,
        allFishMaster.filter((f) => !f.rewardOnly).length
      ),
    [user.tanks, user.lifetimeWordsAnswered, user.lifetimeGoldEarned, user.jobLevel, user.customFish, encyclopedia, allFishMaster]
  );

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-pixel text-foam text-center">🏆 実績</h1>

      {/* 実績カード一覧 */}
      <div className="grid grid-cols-1 gap-3">
        {ACHIEVEMENTS.map((achievement) => {
          const isUnlocked = user.unlockedAchievements?.includes(achievement.id);
          const isClaimed = user.claimedAchievementRewards?.includes(achievement.id) ?? false;
          const rewardFish = allFishMaster.find(
            (f) => f.linkedAchievementId === achievement.id
          );
          const showGetButton = isUnlocked && rewardFish && !isClaimed;

          return (
            <div
              key={achievement.id}
              className={`rounded-2xl p-4 space-y-2 ${
                isUnlocked ? "bg-mid" : "bg-deep/50 opacity-70"
              }`}
            >
              {/* ヘッダー */}
              <div className="flex items-start gap-3">
                <div className="text-3xl flex-shrink-0">
                  {isUnlocked ? "✅" : "🔒"}
                </div>
                <div className="flex-1">
                  <div className={`font-pixel text-lg ${isUnlocked ? "text-foam" : "text-dim"}`}>
                    {achievement.icon} {achievement.label}
                  </div>
                  <div className={`text-xs font-pixel ${isUnlocked ? "text-glow" : "text-dim/50"}`}>
                    {achievement.description}
                  </div>
                </div>
              </div>

              {/* 進捗テキスト（未達成時のみ） */}
              {!isUnlocked && achievement.progressText && (
                <div className="text-xs font-pixel text-coral ml-12">
                  {achievement.progressText(stats)}
                </div>
              )}

              {/* 報酬魚 */}
              {rewardFish && (
                <div className="ml-12 pt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-pixel text-glow">報酬:</span>
                    <div className="w-10 h-10 bg-sea rounded-lg flex items-center justify-center flex-shrink-0">
                      <PixelFish type={rewardFish.type} size={40} />
                    </div>
                    <span className="text-xs font-pixel text-glow">
                      {rewardFish.displayName ?? rewardFish.type}
                    </span>
                  </div>

                  {showGetButton && (
                    <button
                      onClick={() => game.claimAchievementReward(achievement.id)}
                      className="w-full py-2 rounded-xl bg-glow text-deep text-sm font-bold font-pixel active:scale-95 transition-transform"
                    >
                      🎁 GET
                    </button>
                  )}
                  {isClaimed && (
                    <div className="text-center text-xs font-pixel text-dim">受け取り済み ✅</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
