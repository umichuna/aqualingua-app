// 全員共有データ（カスタム魚・組み込み魚の編集）を扱う API クライアント共通処理。
// customFish.ts と fishOverrides.ts に同じ実装が重複していたため、こちらに集約した。
// リトライ回数などを変えるときに片方だけ直す取りこぼしを防ぐ。

// サーバーが返した実エラー文言（{ error } JSON）を読み取る。無ければ statusText。
export async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない場合は無視
  }
  return response.statusText || `HTTP ${response.status}`;
}

// DBが落ちている/無料枠切れのときに何度も起こしに行かないよう、再試行は2回まで。
// （!res.ok は再試行せずそのまま返すので、対象はネットワーク断・タイムアウトのみ）
export async function fetchWithRetry(
  path: string,
  init: RequestInit = {},
  retries = 2,
  timeoutMs = 55_000
): Promise<Response> {
  const backoffMs = [5000, 10000, 20000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetch(path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt] ?? 20000));
      }
    }
  }
  throw lastErr;
}
