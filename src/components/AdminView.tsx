"use client";

import { useState } from "react";
import { useGame } from "./GameProvider";

export default function AdminView() {
  const game = useGame();
  const { words } = game;

  const [newGenreInput, setNewGenreInput] = useState("");
  const [confirmGenre, setConfirmGenre] = useState<string | null>(null);

  const handleRemoveGenre = (genre: string) => {
    const count = words.filter((w) => w.genre === genre).length;
    if (count > 0) {
      setConfirmGenre(genre);
    } else {
      game.removeCustomGenre(genre);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto">
      <h2 className="font-bold text-lg text-foam">🔧 管理者 — ジャンル管理</h2>

      <div>
        <div className="text-xs text-dim mb-3">
          ジャンルは単語データから自動検出されます。ここでは手動追加・削除ができます。
        </div>

        <div className="flex gap-2 mb-3">
          <input
            value={newGenreInput}
            onChange={(e) => setNewGenreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const g = newGenreInput.trim();
                if (g) { game.addCustomGenre(g); setNewGenreInput(""); }
              }
            }}
            maxLength={20}
            placeholder="新しいジャンル名を入力"
            className="flex-1 px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm"
          />
          <button
            onClick={() => {
              const g = newGenreInput.trim();
              if (g) { game.addCustomGenre(g); setNewGenreInput(""); }
            }}
            className="px-3 py-2 rounded-xl bg-glow text-deep font-bold text-sm shrink-0"
          >
            追加
          </button>
        </div>

        {game.allGenres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {game.allGenres.map((g) => {
              const wordCount = words.filter((w) => w.genre === g).length;
              return (
                <div key={g} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-mid text-sm">
                  <span className="text-foam">{g}</span>
                  {wordCount > 0 && (
                    <span className="text-dim text-[10px]">({wordCount})</span>
                  )}
                  <button
                    onClick={() => handleRemoveGenre(g)}
                    className="text-coral text-xs font-bold leading-none"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {game.allGenres.length === 0 && (
          <div className="text-xs text-dim">ジャンルがありません</div>
        )}
      </div>

      {confirmGenre !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-deep rounded-2xl p-5 max-w-xs w-full flex flex-col gap-4">
            <p className="text-foam text-sm font-bold">
              「{confirmGenre}」を削除すると、このジャンルを持つ単語{words.filter((w) => w.genre === confirmGenre).length}件のジャンルも空白になります。よろしいですか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmGenre(null)}
                className="flex-1 py-2 rounded-xl bg-white/10 text-dim text-sm font-bold"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  game.removeCustomGenre(confirmGenre, true);
                  setConfirmGenre(null);
                }}
                className="flex-1 py-2 rounded-xl bg-coral text-white text-sm font-bold"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
