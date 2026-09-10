// 同期ロジック(src/lib/sync.ts)のユニットテスト。
// STATUS_REPORT.md 追記12で見つかった致命的回帰(トランザクションエラーの誤タイムアウト判定)と
// 追記10〜11のエラー分類ロジックを、退行検知できる形でテスト化する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlySyncErrorMessage, mergeUserStatus } from "../src/lib/sync";
import type { UserStatus, Tank } from "../src/lib/types";

function makeUserStatus(overrides: Partial<UserStatus> = {}): UserStatus {
  return {
    userId: "u1",
    gold: 0,
    jobLevel: 1,
    achievedTitles: [],
    lastActiveTime: 0,
    lastUpdated: 0,
    items: { baitBasic: 0, baitPremium: 0, medicine: 0 },
    tankCapacity: 3,
    totalStudyCount: 0,
    lastRewardDate: "",
    onboardingDone: true,
    customGenres: [],
    ...overrides,
  };
}

test("friendlySyncErrorMessage: トランザクションエラー(abort全般)はタイムアウト扱いにしない", () => {
  // 追記12の回帰: mssqlはSQLエラー全般で "Transaction has been aborted." を投げる。
  // これをタイムアウトと誤判定すると「保存できているかも」と案内し、未保存データを失わせる。
  assert.equal(
    friendlySyncErrorMessage("TransactionError: Transaction has been aborted.", "push"),
    null
  );
  assert.equal(friendlySyncErrorMessage("Error: aborted", "push"), null);
});

test("friendlySyncErrorMessage: 接続タイムアウトは正しくタイムアウト扱いにする", () => {
  const msg = friendlySyncErrorMessage("Failed to connect to db.example.com in 30000ms", "push");
  assert.ok(msg && msg.includes("時間切れ"));
});

test("friendlySyncErrorMessage: クエリタイムアウトも検知する", () => {
  const msg = friendlySyncErrorMessage("Timeout: Request failed to complete in 30000ms", "pull");
  assert.ok(msg && msg.includes("時間切れ"));
});

test("friendlySyncErrorMessage: ペイロード超過(413)を検知する", () => {
  const msg = friendlySyncErrorMessage("Request Entity Too Large: 413", "push");
  assert.ok(msg && msg.includes("大きすぎて"));
});

test("friendlySyncErrorMessage: 該当しないエラーはnullを返す(汎用文言で上書きしない)", () => {
  assert.equal(friendlySyncErrorMessage("Unexpected token in JSON", "push"), null);
});

test("mergeUserStatus: クラウドが新しい場合、墓標(削除記録)はローカルと和集合する", () => {
  const local = makeUserStatus({
    lastUpdated: 100,
    lastActiveTime: 100,
    deletedWordIds: ["w1"],
    deletedFishIds: [],
  });
  const cloud = makeUserStatus({
    lastUpdated: 200,
    lastActiveTime: 200,
    gold: 500,
    deletedWordIds: ["w2"],
    deletedFishIds: ["f1"],
  });
  const merged = mergeUserStatus(local, cloud);
  assert.equal(merged.gold, 500); // クラウドをベースにする
  assert.deepEqual(new Set(merged.deletedWordIds), new Set(["w1", "w2"])); // 和集合で救済
  assert.deepEqual(merged.deletedFishIds, ["f1"]);
});

test("mergeUserStatus: ローカルが新しい場合、水槽はid基準の和集合で救済する", () => {
  const tankLocal: Tank = { id: "sw-1", type: "saltwater", name: "海水 1" };
  const tankCloudOnly: Tank = { id: "sw-2", type: "saltwater", name: "海水 2" };
  const local = makeUserStatus({ lastUpdated: 300, lastActiveTime: 300, tanks: [tankLocal] });
  const cloud = makeUserStatus({ lastUpdated: 100, lastActiveTime: 100, tanks: [tankCloudOnly] });
  const merged = mergeUserStatus(local, cloud);
  const ids = (merged.tanks ?? []).map((t) => t.id).sort();
  // 別端末で買った水槽(sw-2)が、ローカル優先の巻き戻りで消えないことを確認
  assert.deepEqual(ids, ["sw-1", "sw-2"]);
});

test("mergeUserStatus: lastActiveTimeは常に新しい方を採る(巻き戻り防止)", () => {
  const local = makeUserStatus({ lastUpdated: 300, lastActiveTime: 999 });
  const cloud = makeUserStatus({ lastUpdated: 999, lastActiveTime: 100 });
  const merged = mergeUserStatus(local, cloud);
  // cloudがlastUpdatedで勝っても、lastActiveTimeはローカルの999を採る
  // (放置ペナルティの二重適用防止、sync.tsのコメント参照)
  assert.equal(merged.lastActiveTime, 999);
});
