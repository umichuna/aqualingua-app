// 放置ペナルティ計算(src/lib/gameLogic.ts)のユニットテスト。
// STATUS_REPORT.md 追記12で見つかった致命的回帰(NaN/null汚染で全魚が野生復帰扱いになる)を
// 退行検知できる形でテスト化する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { elapsedPenaltyDays, calculateOfflineEffects, DAY_MS } from "../src/lib/gameLogic";
import type { Fish } from "../src/lib/types";

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    fishId: "f1",
    name: "テスト魚",
    type: "clownfish",
    rarity: "普通",
    growthStage: "成魚",
    level: 1,
    affection: 100,
    status: "swimming",
    isSick: false,
    sickStartTime: null,
    lastUpdated: 0,
    ...overrides,
  };
}

test("elapsedPenaltyDays: 通常の経過日数を切り捨てで返す", () => {
  const now = 10 * DAY_MS;
  assert.equal(elapsedPenaltyDays(0, now), 10);
  assert.equal(elapsedPenaltyDays(DAY_MS / 2, now), 9); // 端数切り捨て
});

test("elapsedPenaltyDays: undefined/NaNは経過0扱いにする(NaN汚染防止)", () => {
  // @ts-expect-error 実運用ではクラウド/バックアップ由来のJSONでこうした不正値が来うる
  assert.equal(elapsedPenaltyDays(undefined, Date.now()), 0);
  assert.equal(elapsedPenaltyDays(NaN, Date.now()), 0);
});

test("elapsedPenaltyDays: nullは「エポックからの経過」に化けさせず経過0扱いにする", () => {
  // 追記12の回帰: null は数値演算で 0 に化け、約2万日経過と誤解釈されていた
  // @ts-expect-error 実運用ではクラウド/バックアップ由来のJSONでnullが来うる
  assert.equal(elapsedPenaltyDays(null, Date.now()), 0);
});

test("elapsedPenaltyDays: 未来のlastActiveTime(時計ズレ等)は負値を返さない", () => {
  const now = 0;
  assert.equal(elapsedPenaltyDays(10 * DAY_MS, now), 0);
});

test("calculateOfflineEffects: 1日未満の経過では何も変えない", () => {
  const fish = [makeFish({ affection: 100 })];
  const result = calculateOfflineEffects(fish, 0, DAY_MS / 2);
  assert.equal(result, fish); // 早期returnでそのまま同一参照を返す
});

test("calculateOfflineEffects: 不正なlastActiveTime(NaN)では好感度を破壊しない", () => {
  // 追記12の回帰: elapsedPenaltyDaysがNaNを返すと、好感度がNaN汚染されていた
  const fish = [makeFish({ affection: 100 })];
  const result = calculateOfflineEffects(fish, NaN, Date.now());
  assert.equal(result[0].affection, 100); // 変化なし(経過0扱い)
  assert.ok(Number.isFinite(result[0].affection));
});

test("calculateOfflineEffects: 経過日数ぶん好感度を減らし、0で病気にする(耐性0)", () => {
  const now = 40 * DAY_MS; // AFFECTION_DROP_PER_DAY=3 × 40日 = 120 > 100
  const fish = [makeFish({ affection: 100, isSick: false })];
  const result = calculateOfflineEffects(fish, 0, now, { disease_resistance: 0 });
  assert.equal(result[0].affection, 0);
  assert.equal(result[0].isSick, true);
});

test("calculateOfflineEffects: 病気耐性1.0なら好感度0でも発症しない", () => {
  const now = 40 * DAY_MS;
  const fish = [makeFish({ affection: 100, isSick: false })];
  const result = calculateOfflineEffects(fish, 0, now, { disease_resistance: 1 });
  assert.equal(result[0].affection, 0);
  assert.equal(result[0].isSick, false);
});

test("calculateOfflineEffects: 病気開始から3日以上で野生復帰(running_away)になる", () => {
  const sickStart = 0;
  const now = sickStart + 4 * DAY_MS;
  const fish = [makeFish({ affection: 0, isSick: true, sickStartTime: sickStart })];
  const result = calculateOfflineEffects(fish, now - DAY_MS, now);
  assert.equal(result[0].status, "running_away");
});
