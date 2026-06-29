import type { FishOverride } from "./types";

// 組み込み魚のオーバーライド（名前・画像・サイズ等）を全ユーザー共有する API クライアント。
// 誰かが魚を編集すると全員に反映される。

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない場合は無視
  }
  return response.statusText || `HTTP ${response.status}`;
}

// 共有 FishOverride を全件取得
export async function fetchSharedFishOverrides(): Promise<FishOverride[]> {
  const res = await fetch("/api/fish-overrides", { method: "GET" });
  if (!res.ok) throw new Error(`fetch fish overrides failed: ${await readError(res)}`);
  const body = await res.json();
  return Array.isArray(body?.overrides) ? (body.overrides as FishOverride[]) : [];
}

// 共有 FishOverride を登録/更新（全ユーザーへ反映）
export async function postSharedFishOverride(override: FishOverride): Promise<void> {
  const res = await fetch("/api/fish-overrides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(override),
  });
  if (!res.ok) throw new Error(`post fish override failed: ${await readError(res)}`);
}

// 共有 FishOverride を削除（全ユーザーから消える）
export async function deleteSharedFishOverride(fishType: string): Promise<void> {
  const res = await fetch("/api/fish-overrides", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fishType }),
  });
  if (!res.ok) throw new Error(`delete fish override failed: ${await readError(res)}`);
}
