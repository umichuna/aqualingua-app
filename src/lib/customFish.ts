import type { CustomFishDef } from "./types";

// 全員共有のカスタム魚 API（/api/custom-fish）クライアント。
// 共有テーブルから取得・登録・削除する。誰かが追加すると全員のガチャ・図鑑に出る。

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない場合は無視
  }
  return response.statusText || `HTTP ${response.status}`;
}

// 共有カスタム魚を全件取得
export async function fetchSharedCustomFish(): Promise<CustomFishDef[]> {
  const res = await fetch("/api/custom-fish", { method: "GET" });
  if (!res.ok) throw new Error(`fetch shared fish failed: ${await readError(res)}`);
  const body = await res.json();
  return Array.isArray(body?.fish) ? (body.fish as CustomFishDef[]) : [];
}

// 共有カスタム魚を登録（全ユーザーへ反映）
export async function postSharedCustomFish(def: CustomFishDef): Promise<void> {
  const res = await fetch("/api/custom-fish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error(`post shared fish failed: ${await readError(res)}`);
}

// 共有カスタム魚を削除（全ユーザーから消える）
export async function deleteSharedCustomFish(fishType: string): Promise<void> {
  const res = await fetch("/api/custom-fish", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fishType }),
  });
  if (!res.ok) throw new Error(`delete shared fish failed: ${await readError(res)}`);
}
