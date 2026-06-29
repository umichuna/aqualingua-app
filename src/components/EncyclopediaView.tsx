"use client";

// 図鑑ビュー
// - 発見済みの魚は実物表示、未発見はシルエット表示
// - 発見済みの魚をタップ → 歴代おさかな一覧モーダル
// - ✏️ ボタン → 編集モーダル（組み込み魚=発見済みのみ / カスタム魚=全魚）
// - ＋ カスタム魚追加ボタン（ヘッダー右）

import { useState } from "react";
import { FISH_MASTER, RARITY_INFO, RARITY_STARS, type FishDisplaySize } from "@/data/fishMaster";
import { todayString } from "@/lib/gameLogic";
import type { CustomFishDef, FishHistoryEntry, FishOverride, Rarity, WaterType } from "@/lib/types";
import { useGame } from "./GameProvider";
import PixelFish from "./PixelFish";

const RARITIES: Rarity[] = ["激安", "普通", "高級", "ロマン"];
const DISPLAY_SIZES: { value: FishDisplaySize; label: string }[] = [
  { value: "tiny", label: "最小（24px）" },
  { value: "xsmall", label: "超小（36px）" },
  { value: "small", label: "小（48px）" },
  { value: "medium", label: "中（72px）" },
  { value: "large", label: "大（96px）" },
  { value: "xlarge", label: "超大（128px）" },
];

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

const BUILTIN_TYPES = new Set(FISH_MASTER.map((f) => f.type));

const EMPTY_CUSTOM_FORM = {
  type: "",
  rarity: "普通" as Rarity,
  description: "",
  layer: "middle" as "middle" | "bottom",
  displaySize: "medium" as FishDisplaySize,
  paletteIdx: 0,
  imageUrl: "",
};

const RARITY_ORDER: Record<Rarity, number> = { 激安: 0, 普通: 1, 高級: 2, ロマン: 3 };

function resizeToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

          {currentNames.map((name) => (
            <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5">
              <span className="text-base">🐠</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-foam">{name}</div>
                <div className="text-[10px] text-glow">現在 水槽にいる</div>
              </div>
            </div>
          ))}

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
  const game = useGame();
  const { encyclopedia, fishHistory, fishList, allFishMaster, user } = game;
  const discovered = new Set(encyclopedia.map((e) => e.fishType));

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [secretUnlocked, setSecretUnlocked] = useState(false);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<{ type: string; isCustom: boolean } | null>(null);

  // 組み込み魚編集フォーム
  const [builtinForm, setBuiltinForm] = useState<{
    displayName: string;
    rarity: Rarity;
    displaySize: FishDisplaySize;
    waterType: WaterType;
    description: string;
    imageUrl: string;
  }>({
    displayName: "",
    rarity: "普通",
    displaySize: "medium",
    waterType: "saltwater",
    description: "",
    imageUrl: "",
  });

  // カスタム魚編集・追加フォーム
  const [customForm, setCustomForm] = useState({ ...EMPTY_CUSTOM_FORM });
  const [customError, setCustomError] = useState("");
  const [showAddCustom, setShowAddCustom] = useState(false);

  const openEditBuiltin = (type: string) => {
    const fish = allFishMaster.find((f) => f.type === type);
    if (!fish) return;
    setBuiltinForm({
      displayName: fish.displayName ?? "",
      rarity: fish.rarity,
      displaySize: fish.displaySize ?? "medium",
      waterType: fish.waterType ?? "saltwater",
      description: fish.description,
      imageUrl: fish.imageUrl ?? "",
    });
    setEditTarget({ type, isCustom: false });
  };

  const openEditCustom = (type: string) => {
    const fish =
      (user.customFish ?? []).find((f) => f.type === type) ??
      allFishMaster.find((f) => f.type === type);
    if (!fish) return;
    setCustomForm({
      type: fish.type,
      rarity: fish.rarity,
      description: fish.description,
      layer: (fish as CustomFishDef).layer === "bottom" ? "bottom" : "middle",
      displaySize: fish.displaySize ?? "medium",
      paletteIdx: 0,
      imageUrl: fish.imageUrl ?? "",
    });
    setCustomError("");
    setEditTarget({ type, isCustom: true });
  };

  const saveBuiltin = () => {
    if (!editTarget) return;
    const override: FishOverride = {
      type: editTarget.type,
      displayName: builtinForm.displayName.trim() || undefined,
      rarity: builtinForm.rarity,
      displaySize: builtinForm.displaySize,
      waterType: builtinForm.waterType,
      description: builtinForm.description,
      imageUrl: builtinForm.imageUrl || undefined,
    };
    game.updateBuiltinFish(override);
    setEditTarget(null);
  };

  const saveCustom = () => {
    if (!editTarget) return;
    const def: CustomFishDef = {
      type: editTarget.type,
      rarity: customForm.rarity,
      description: customForm.description.trim(),
      palette: PALETTE_PRESETS[customForm.paletteIdx].palette,
      layer: customForm.layer === "bottom" ? "bottom" : undefined,
      displaySize: customForm.displaySize,
      imageUrl: customForm.imageUrl || undefined,
    };
    game.updateCustomFish(def);
    setEditTarget(null);
  };

  const submitAddCustom = () => {
    const type = customForm.type.trim();
    if (!type) { setCustomError("種類名を入力してください"); return; }
    if (!customForm.description.trim()) { setCustomError("説明を入力してください"); return; }
    if (allFishMaster.some((f) => f.type === type)) {
      setCustomError(`「${type}」はすでに存在します`);
      return;
    }
    const def: CustomFishDef = {
      type,
      rarity: customForm.rarity,
      description: customForm.description.trim(),
      palette: PALETTE_PRESETS[customForm.paletteIdx].palette,
      layer: customForm.layer === "bottom" ? "bottom" : undefined,
      displaySize: customForm.displaySize,
      imageUrl: customForm.imageUrl || undefined,
    };
    game.addCustomFish(def);
    setCustomForm({ ...EMPTY_CUSTOM_FORM });
    setShowAddCustom(false);
    setCustomError("");
  };

  const selectedEntries = selectedType
    ? fishHistory.filter((h) => h.fishType === selectedType)
    : [];
  const selectedCurrentNames = selectedType
    ? fishList.filter((f) => f.type === selectedType).map((f) => f.name)
    : [];

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-foam">
          おさかな図鑑{" "}
          <span className="text-xs text-dim">
            {discovered.size} / {allFishMaster.length} 種 発見
          </span>
        </h2>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              if (secretUnlocked) { setSecretUnlocked(false); return; }
              const pw = window.prompt("パスワードを入力してください");
              if (pw === "shi-chankawaii0521LOVE") setSecretUnlocked(true);
            }}
            className="text-base leading-none"
            title={secretUnlocked ? "ロック解除中（タップで解錠）" : "管理者モード"}
          >
            {secretUnlocked ? "🔓" : "🔒"}
          </button>
          <button
            onClick={() => { setCustomForm({ ...EMPTY_CUSTOM_FORM }); setCustomError(""); setShowAddCustom(true); }}
            className="text-xs px-3 py-1.5 rounded-xl bg-glow text-deep font-bold"
          >
            ＋ カスタム魚
          </button>
        </div>
      </div>

      {/* 魚グリッド */}
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">
        {[...allFishMaster]
          .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0))
          .map((f) => {
            const found = discovered.has(f.type);
            const isCustom = !BUILTIN_TYPES.has(f.type);
            const canEdit = isCustom || found || secretUnlocked;

            return (
              <div
                key={f.type}
                onClick={() => found && setSelectedType(f.type)}
                className={`relative rounded-xl p-3 bg-mid text-center ${found ? "cursor-pointer active:bg-white/10 transition-colors" : ""}`}
              >
                {/* 編集・削除ボタン */}
                {canEdit && (
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    {isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`「${f.type}」を削除しますか？`)) {
                            game.removeCustomFish(f.type);
                          }
                        }}
                        className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-lg text-coral leading-tight active:bg-black/70"
                      >
                        🗑
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCustom) openEditCustom(f.type);
                        else openEditBuiltin(f.type);
                      }}
                      className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-lg text-foam leading-tight active:bg-black/70"
                    >
                      ✏️
                    </button>
                  </div>
                )}

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
                  {found ? (f.displayName ?? f.type) : "？？？"}
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

      {/* 歴代モーダル */}
      {selectedType && (
        <FishHistoryModal
          fishType={allFishMaster.find((f) => f.type === selectedType)?.displayName ?? selectedType}
          currentNames={selectedCurrentNames}
          entries={selectedEntries}
          onClose={() => setSelectedType(null)}
        />
      )}

      {/* 組み込み魚 編集モーダル */}
      {editTarget && !editTarget.isCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-sm bg-sea font-pixel rounded-2xl max-h-[85vh] flex flex-col"
            style={{ border: "2px solid var(--aqua-glow)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="font-bold text-foam text-sm">✏️ {editTarget.type} を編集</div>
              <button onClick={() => setEditTarget(null)} className="text-dim text-sm font-bold">
                とじる
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">
              {/* 表示名 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">表示名（空欄でデフォルト名）</div>
                <input
                  value={builtinForm.displayName}
                  onChange={(e) => setBuiltinForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder={editTarget.type}
                  maxLength={20}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm"
                />
              </div>

              {/* レア度 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">レア度</div>
                <div className="flex gap-1.5">
                  {RARITIES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setBuiltinForm((f) => ({ ...f, rarity: r }))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: builtinForm.rarity === r ? RARITY_INFO[r].color : "rgba(255,255,255,0.08)",
                        color: builtinForm.rarity === r ? "var(--aqua-deep)" : "var(--aqua-dim)",
                      }}
                    >
                      {RARITY_STARS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 水の種類 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">水の種類</div>
                <div className="flex gap-2">
                  {(["saltwater", "freshwater"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setBuiltinForm((f) => ({ ...f, waterType: t }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${builtinForm.waterType === t ? "bg-sand text-deep" : "bg-white/10 text-dim"}`}
                    >
                      {t === "saltwater" ? "🌊 海水" : "🌿 淡水"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 表示サイズ */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">表示サイズ</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DISPLAY_SIZES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setBuiltinForm((f) => ({ ...f, displaySize: s.value }))}
                      className={`py-1.5 rounded-lg text-xs font-bold ${builtinForm.displaySize === s.value ? "bg-glow text-deep" : "bg-white/10 text-dim"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 説明 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">説明</div>
                <textarea
                  value={builtinForm.description}
                  onChange={(e) => setBuiltinForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={60}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm resize-none"
                />
              </div>

              {/* 画像 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">画像（PNG/JPG）</div>
                {builtinForm.imageUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={builtinForm.imageUrl} alt="プレビュー" className="w-12 h-12 rounded-lg object-contain bg-black/20" />
                    <button
                      onClick={() => setBuiltinForm((f) => ({ ...f, imageUrl: "" }))}
                      className="text-xs text-coral underline"
                    >
                      削除
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-black/30 text-dim text-sm">
                    📷 画像を選択
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const b64 = await resizeToBase64(file);
                        setBuiltinForm((f) => ({ ...f, imageUrl: b64 }));
                      }}
                    />
                  </label>
                )}
              </div>

              {/* ボタン */}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditTarget(null)}
                  className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim rounded-xl"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveBuiltin}
                  className="flex-1 py-2 text-sm font-bold bg-glow text-deep rounded-xl"
                >
                  更新する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* カスタム魚 編集モーダル */}
      {editTarget && editTarget.isCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-sm bg-sea font-pixel rounded-2xl max-h-[85vh] flex flex-col"
            style={{ border: "2px solid var(--aqua-glow)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="font-bold text-foam text-sm">✏️ {editTarget.type} を編集</div>
              <button onClick={() => setEditTarget(null)} className="text-dim text-sm font-bold">
                とじる
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">
              {/* レア度 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">レア度</div>
                <div className="flex gap-1.5">
                  {RARITIES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setCustomForm((f) => ({ ...f, rarity: r }))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: customForm.rarity === r ? RARITY_INFO[r].color : "rgba(255,255,255,0.08)",
                        color: customForm.rarity === r ? "var(--aqua-deep)" : "var(--aqua-dim)",
                      }}
                    >
                      {RARITY_STARS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 表示層 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">表示層</div>
                <div className="flex gap-2">
                  {(["middle", "bottom"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setCustomForm((f) => ({ ...f, layer: l }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${customForm.layer === l ? "bg-sand text-deep" : "bg-white/10 text-dim"}`}
                    >
                      {l === "middle" ? "🌊 水中" : "🪸 底生"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 表示サイズ */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">表示サイズ</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DISPLAY_SIZES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setCustomForm((f) => ({ ...f, displaySize: s.value }))}
                      className={`py-1.5 rounded-lg text-xs font-bold ${customForm.displaySize === s.value ? "bg-glow text-deep" : "bg-white/10 text-dim"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 説明 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">説明</div>
                <textarea
                  value={customForm.description}
                  onChange={(e) => setCustomForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={60}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm resize-none"
                />
              </div>

              {/* 画像 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">画像（任意）</div>
                {customForm.imageUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={customForm.imageUrl} alt="プレビュー" className="w-16 h-16 rounded-xl object-contain bg-black/20" />
                    <button
                      onClick={() => setCustomForm((f) => ({ ...f, imageUrl: "" }))}
                      className="text-xs text-coral underline"
                    >
                      削除
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer w-full px-3 py-2 rounded-xl bg-black/30 text-dim text-sm">
                    <span>📷 画像を選ぶ</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await resizeToBase64(file);
                        setCustomForm((f) => ({ ...f, imageUrl: url }));
                      }}
                    />
                  </label>
                )}
              </div>

              {/* ボタン */}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditTarget(null)}
                  className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim rounded-xl"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveCustom}
                  className="flex-1 py-2 text-sm font-bold bg-glow text-deep rounded-xl"
                >
                  更新する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* カスタム魚 追加モーダル */}
      {showAddCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-sm bg-sea font-pixel rounded-2xl max-h-[85vh] flex flex-col"
            style={{ border: "2px solid var(--aqua-glow)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="font-bold text-foam text-sm">＋ カスタム魚を追加</div>
              <button onClick={() => setShowAddCustom(false)} className="text-dim text-sm font-bold">
                とじる
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-3">
              {customError && <p className="text-xs text-coral">{customError}</p>}

              {/* 種類名 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">種類名（図鑑のキー）</div>
                <input
                  value={customForm.type}
                  onChange={(e) => setCustomForm((f) => ({ ...f, type: e.target.value }))}
                  maxLength={12}
                  placeholder="例: タツノオトシゴ"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm"
                />
              </div>

              {/* レア度 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">レア度</div>
                <div className="flex gap-1.5">
                  {RARITIES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setCustomForm((f) => ({ ...f, rarity: r }))}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: customForm.rarity === r ? RARITY_INFO[r].color : "rgba(255,255,255,0.08)",
                        color: customForm.rarity === r ? "var(--aqua-deep)" : "var(--aqua-dim)",
                      }}
                    >
                      {RARITY_STARS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 表示層 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">表示層</div>
                <div className="flex gap-2">
                  {(["middle", "bottom"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setCustomForm((f) => ({ ...f, layer: l }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${customForm.layer === l ? "bg-sand text-deep" : "bg-white/10 text-dim"}`}
                    >
                      {l === "middle" ? "🌊 水中" : "🪸 底生"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 表示サイズ */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">表示サイズ</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DISPLAY_SIZES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setCustomForm((f) => ({ ...f, displaySize: s.value }))}
                      className={`py-1.5 rounded-lg text-xs font-bold ${customForm.displaySize === s.value ? "bg-glow text-deep" : "bg-white/10 text-dim"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 説明 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">説明（図鑑に表示）</div>
                <textarea
                  value={customForm.description}
                  onChange={(e) => setCustomForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={60}
                  rows={2}
                  placeholder="例: 海の底をゆっくり泳ぐ不思議な生き物。"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 text-foam outline-none text-sm resize-none"
                />
              </div>

              {/* 画像 */}
              <div>
                <div className="text-xs font-bold text-glow mb-1">画像（任意）<span className="font-normal text-dim ml-1">透明背景のPNGで自然に見えます</span></div>
                {customForm.imageUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={customForm.imageUrl} alt="プレビュー" className="w-16 h-16 rounded-xl object-contain bg-black/20" />
                    <button
                      onClick={() => setCustomForm((f) => ({ ...f, imageUrl: "" }))}
                      className="text-xs text-coral underline"
                    >
                      削除
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer w-full px-3 py-2 rounded-xl bg-black/30 text-dim text-sm">
                    <span>📷 画像を選ぶ</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await resizeToBase64(file);
                          setCustomForm((f) => ({ ...f, imageUrl: url }));
                        } catch {
                          setCustomError("画像の読み込みに失敗しました");
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* ボタン */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddCustom(false)}
                  className="flex-1 py-2 text-sm font-bold bg-white/10 text-dim rounded-xl"
                >
                  キャンセル
                </button>
                <button
                  onClick={submitAddCustom}
                  className="flex-1 py-2 text-sm font-bold bg-glow text-deep rounded-xl"
                >
                  追加する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
