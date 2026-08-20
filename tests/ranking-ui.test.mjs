// 群俠錄接線驗收(§9.7 名次 / §9.9 排位互動 / §8.1 稱號 / §9.6 聲望)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  playerRankSnapshot, namedNpcAtRank, nextNamedNpcAbove, nextIntegerMilestone,
  surpassTier, surpassFameReward, integerMilestonesCrossed
} from "../src/engine/npcs.js";
import { reputationSnapshot } from "../src/engine/reputation.js";
import { rankingTitleForPercentile } from "../src/engine/titles.js";
import { newState, playerLevelSum, revealRanking, addExp } from "../src/engine/game.js";
import { thresholdForLevel, DIMENSIONS } from "../src/engine/exp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  npcs: loadJson("data/npcs.json"),
  titles: loadJson("data/titles.json"),
  reputation: loadJson("data/reputation.json")
};

// ---------- 前方目標(§9.9) ----------

test("nextNamedNpcAbove:百強內回上一名的具名對手", () => {
  const npc = nextNamedNpcAbove(50, data.npcs);
  assert.equal(npc.rank, 49);
  assert.ok(npc.name);
});

test("nextNamedNpcAbove:天下第一前頭沒有人", () => {
  assert.equal(nextNamedNpcAbove(1, data.npcs), null);
});

test("nextNamedNpcAbove:百強外沒有具名對手", () => {
  assert.equal(nextNamedNpcAbove(500, data.npcs), null);
});

test("nextIntegerMilestone:第 900,000 名的下一道坎是 850,000", () => {
  assert.equal(nextIntegerMilestone(900000), 850000);
});

test("nextIntegerMilestone:剛好站在坎上,下一道是再前面五萬名", () => {
  assert.equal(nextIntegerMilestone(850000), 800000);
});

test("nextIntegerMilestone:進了第一道坎以內就不再報關口", () => {
  assert.equal(nextIntegerMilestone(50000), null);
  assert.equal(nextIntegerMilestone(120), null);
});

test("nextIntegerMilestone 與 integerMilestonesCrossed 對得上:報的坎跨過去就會被播報", () => {
  const m = nextIntegerMilestone(900000);
  assert.deepEqual(integerMilestonesCrossed(900000, m), [m]);
});

// ---------- 名次與稱號(§9.7.1 / §8.1) ----------

test("新角色從天下總冊末段起算(§9.7.1 #900,000 開外)", () => {
  const state = newState();
  const snap = playerRankSnapshot(playerLevelSum(state), data.npcs);
  assert.ok(snap.rank >= 900000, `rank=${snap.rank}`);
});

test("練功推高六維總和 → 名次前進", () => {
  const state = newState();
  const before = playerRankSnapshot(playerLevelSum(state), data.npcs).rank;
  addExp(state, { light: thresholdForLevel(20) }, data);
  const after = playerRankSnapshot(playerLevelSum(state), data.npcs).rank;
  assert.ok(after < before, `${before} → ${after}`);
});

test("名次對應的群俠錄稱號查得到,且末段是最低階", () => {
  const state = newState();
  const snap = playerRankSnapshot(playerLevelSum(state), data.npcs);
  const title = rankingTitleForPercentile(snap.percentile, data, { isRank1: snap.rank === 1 });
  assert.equal(title, data.titles.ranking.tiers.find((t) => t.condition === "bottom50").title);
});

// ---------- 超越快報(§9.9) ----------

test("revealRanking:超越具名百強 → flag 落地、俠名入帳、只算一次", () => {
  const state = newState();
  revealRanking(state, data); // 第一次看榜只是對時,不視為跨越
  const gains = {};
  for (const d of DIMENSIONS) gains[d] = thresholdForLevel(50); // 六維各 Lv.50 → levelSum 300,已在百強帶內
  addExp(state, gains, data);

  const result = revealRanking(state, data);
  assert.ok(result.surpassed.length > 0, "應該壓過了一些具名百強");
  const first = result.surpassed[0];
  assert.equal(state.flags[`surpassed_${first.rank}`], true);
  assert.ok(state.reputation.fame > 0);

  const fameAfterFirst = state.reputation.fame;
  const again = revealRanking(state, data);
  assert.equal(again.surpassed.length, 0, "同一批人不會再算一次");
  assert.equal(state.reputation.fame, fameAfterFirst);
});

test("被超越反應詞:#11–#100 每人一句(#1–#10 依 §9.7.5 走深度互動,Phase 1 無反應詞)", () => {
  for (const npc of data.npcs.top100) {
    if (npc.rank <= 10) assert.equal(npc.surpassReaction, undefined, `#${npc.rank} 不該有反應詞`);
    else assert.ok(npc.surpassReaction, `#${npc.rank} 缺反應詞`);
  }
});

test("surpassTier:十強/存疑者/一般三檔各自分得出來", () => {
  assert.equal(surpassTier(namedNpcAtRank(5, data.npcs)), "top10");
  assert.equal(surpassTier(namedNpcAtRank(35, data.npcs)), "special");
  assert.equal(surpassTier(namedNpcAtRank(50, data.npcs)), "normal");
});

test("surpassFameReward:榜位越前給越多", () => {
  assert.ok(surpassFameReward(1) > surpassFameReward(50));
  assert.ok(surpassFameReward(50) > surpassFameReward(100));
});

// ---------- 江湖評價(§9.6.4) ----------

test("新角色的江湖評價查得到,兩軌都是最低階", () => {
  const state = newState();
  const rep = reputationSnapshot(state.reputation, data.reputation);
  assert.equal(rep.fameTierLabel, data.reputation.fameTiers[0]);
  assert.equal(rep.infamyTierLabel, data.reputation.infamyTiers[0]);
  assert.ok(rep.evaluation);
});

test("評價矩陣九格全都填了字", () => {
  for (const [k, v] of Object.entries(data.reputation.evaluationMatrix)) {
    if (k === "note") continue;
    assert.ok(typeof v === "string" && v.length > 0, `${k} 是空的`);
  }
});
