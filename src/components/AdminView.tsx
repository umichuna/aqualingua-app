"use client";

// 管理者画面 — コードなしでおさかな図鑑を追加できる
// カスタム魚は IndexedDB (UserStatus.customFish) に保存される

import { useState } from "react";
import { FISH_MASTER, RARITY_INFO, RARITY_STARS } from "@/data/fishMaster";
import type { Rarity, CustomFishDef } from "@/lib/types";
import { useGame } from "./GameProvider";
import PixelFish from "./PixelFish";

const RARITIES: Rarity[] = ["激安", "普通", "高級", "ロマン"];

const PALETTE_PRESETS: { label: string; palette: CustomFishDef["palette"] }[] = [
  { label: "青", palette: { body: "#4080C0", stripe: "#80B0E0", fin: "#306090", eye: "#1B1B1B" } },
  { label: "赤", palette: { body: "#E05050", stripe: "#FF9090", fin: "#C03030", eye: "#1B1B1B" } },
  { label: "緑", palette: { body: "#40A060", stripe: "#70C080", fin: "#308050", eye: "#1B1B1B" } },
  { label: "黄", palette: { body: "#D0B040", stripe: "#E8C870", fin: "#A09030", eye: "#1B1B1B" } },
  { label: "紫", palette: { body: "#8050A0", stripe: "#A070C0", fin: "#603080", eye: "#1B1B1B" } },
  { label: "ピンク", palette: { body: "#C06080", stripe: "#E09090", fin: "#A04060", eye: "#1B1B1B" } },
  { label: "橙", palette: { body: "#D07030", stripe: "#E09060", fin: "#B05020", eye: "#1B1B1B" } },
  { label: "銀", palette: { body: "#A0A0B8", stripe: "#C8C8D8", fin: "#808098", eye: "#1B1B1B" } },
];

const EMPTY_FORM: { type: string; rarity: Rarity; description: string; layer: "middle" | "bottom"; paletteIdx: number } = {
  type: "",
  rarity: "普通",
  description: "",
  layer: "middle",
  paletteIdx: 0,
};

export default function AdminView() {
  const game = useGame();
  const { user, allFishMaster } = game;
  const customFish = user.customFish ?? [];
  const customGenres = user.customGenres ?? [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState("");
  const [newGenreInput, setNewGenreInput] = useState("");

  const builtinTypes = new Set(FISH_MASTER.map((f) => f.type));

  const submitAdd = () => {
    const type = form.type.trim();
    if (!type) { setError("種類名を入力してください"); return; }
    if (!form.description.trim()) { setError("説明を入力してください"); return; }
    if (allFishMaster.some((f) => f.type === type)) {
      setError(`「${type}」はすでに存在します`);
      return;
    }
    const def: CustomFishDef = {
      type,
      rarity: form.rarity,
      description: form.description.trim(),
      palette: PALETTE_PRESETS[form.paletteIdx].palette,
      layer: form.layer === "bottom" ? "bottom" : undefined,
    };
    game.addCustomFish(def);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    setError("");
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto">
      <h2 className="font-bold text-lg text-foam">🔧 管理者 — おさかな追加</h2>

      {/* カスタム魚一覧 */}
      {customFish.length > 0 && (
        <div>
          <div className="text-xs font-bold text-glow mb-2">追加したおさかな（{customFish.length}種）</div>
          <div className="flex flex-col gap-2">
            {customFish.map((f) => (
              <div key={f.type} className="flex items-center gap-3 rounded-xl bg-mid p-3">
                <PixelFish type={f.type} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: RARITY_INFO[f.rarity].color, color: "var(--aqua-deep)" }}
                    >
                      {RARITY_STARS[f.rarity]}
                    </span>
                    <span className="text-sm font-bold text-foam">{f.type}</span>
                  </div>
                  <div className="text-[10px] text-dim mt-0.5 truncate">{f.description}</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => game.addFishToTank(f, f.type)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-glow text-deep font-bold"
                  >
                    水槽へ
                  </button>
                  <button
                    onClick={() => game.removeCustomFish(f.type)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-white/10 text-dim"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 追加フォーム */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 rounded-2xl font-bold bg-glow text-deep"
        >
          ＋ おさかなを追加
        </button>
      ) : (
        <div className="rounded-2xl bg-mid p-4 flex flex-col gap-3">
          <div className="font-bold text-foam text-sm">新しいおさかな</div>

          {error && <p className="text-xs text-coral">{error}</p>}

          <div>
            <div className="text-xs font-bold text-glow mb-1">種類名（図鑑のキー）</div>
            <input
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              maxLength={12}
              placeholder="例: タツノオトシゴ"
              className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm"
            />
          </div>

          <div>
            <div className="text-xs font-bold text-glow mb-1">レア度</div>
            <div className="flex gap-1.5">
              {RARITIES.map((r) => (
                <button
                  key={r}
                  onClick={() => setForm((f) => ({ ...f, rarity: r }))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: form.rarity === r ? RARITY_INFO[r].color : "rgba(255,255,255,0.08)",
                    color: form.rarity === r ? "var(--aqua-deep)" : "var(--aqua-dim)",
                  }}
                >
                  {RARITY_STARS[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-glow mb-1">表示層</div>
            <div className="flex gap-2">
              {(["middle", "bottom"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setForm((f) => ({ ...f, layer: l }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${form.layer === l ? "bg-sand text-deep" : "bg-white/10 text-dim"}`}
                >
                  {l === "middle" ? "🌊 水中" : "🪸 底生"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-glow mb-1">カラー</div>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setForm((f) => ({ ...f, paletteIdx: i }))}
                  className="w-9 h-9 rounded-lg border-2 transition-all"
                  style={{
                    background: p.palette.body,
                    borderColor: form.paletteIdx === i ? "var(--aqua-sand)" : "transparent",
                  }}
                  title={p.label}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-center">
              <div
                className="w-12 h-12 rounded-full border-2 border-white/20"
                style={{ background: PALETTE_PRESETS[form.paletteIdx].palette.body }}
                title="カラープレビュー"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-glow mb-1">説明（図鑑に表示）</div>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={60}
              rows={2}
              placeholder="例: 海の底をゆっくり泳ぐ不思議な生き物。"
              className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); setError(""); setForm({ ...EMPTY_FORM }); }}
              className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim rounded-xl"
            >
              キャンセル
            </button>
            <button
              onClick={submitAdd}
              className="flex-1 py-2 text-sm font-bold bg-glow text-deep rounded-xl"
            >
              追加する
            </button>
          </div>
        </div>
      )}

      {/* ビルトイン魚の件数 */}
      <div className="text-xs text-dim text-center">
        デフォルト図鑑: {builtinTypes.size}種 ／ カスタム: {customFish.length}種
      </div>

      {/* ジャンル管理 */}
      <div>
        <h3 className="font-bold text-base text-foam mb-2">📁 ジャンル管理</h3>
        <div className="text-xs text-dim mb-2">
          ジャンルは単語データから自動検出されます。ここでは手動追加・削除ができます。
        </div>

        {/* ジャンル追加フォーム */}
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

        {/* カスタムジャンル一覧（削除可能） */}
        {customGenres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {customGenres.map((g) => (
              <div key={g} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-mid text-sm">
                <span className="text-foam">{g}</span>
                <button
                  onClick={() => game.removeCustomGenre(g)}
                  className="text-coral text-xs font-bold leading-none"
                  title={`「${g}」を削除`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {customGenres.length === 0 && (
          <div className="text-xs text-dim">
            手動追加したジャンルはありません（単語に含まれるジャンルは自動表示）
          </div>
        )}
      </div>
    </div>
  );
}
