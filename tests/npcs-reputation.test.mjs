import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  bandLevelSum, jitteredLevelSum, generateNpcLevelSum,
  estimateRankForLevelSum, percentileForRank, rankingTierIndexForPercentile,
  playerRankSnapshot, namedNpcAtRank,
  integerMilestonesCrossed, surpassedNpcs, surpassTier, surpassFameReward
} from "../src/engine/npcs.js";
import {
  newReputation, addFame, addInfamy, tierIndexFor, bucketOf,
  evaluationText, reputationSnapshot, hypocriteMultiplier, prodigalMultiplier
} from "../src/engine/reputation.js";
import { newState, createCharacter, addExp, chooseOption, startNextEvent, addSteps } from "../src/engine/game.js";
import { eligibleEvents } from "../src/engine/events2.js";

/** 結算一個「B選項無任何效果」的日常事件,輪換避開冷卻 */
const NEUTRAL_EVENTS = ["DA-003_rain_shelter", "DA-001_teahouse_storyteller", "DA-002_sugar_figurine"];
let neutralIdx = 0;
function resolveOneNeutral(s, useData) {
  const id = NEUTRAL_EVENTS[neutralIdx++ % NEUTRAL_EVENTS.length];
  const candidates = eligibleEvents(s, useData, "2026-08-19");
  const idx = candidates.findIndex((c) => c.ev.eventId === id);
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  startNextEvent(s, useData, "2026-08-19", () => (idx + 0.5) / total);
  return chooseOption(s, useData, "B", "2026-08-19").entry;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  events: loadJson("data/events.json"),
  titles: loadJson("data/titles.json"),
  items: loadJson("data/items.json"),
  tags: loadJson("data/tags.json"),
  quiz: loadJson("data/quiz.json"),
  npcs: loadJson("data/npcs.json")
};

// ---------- npcs.json 資料完整性 ----------

test("npcs.json:百強100名皆有name與rank,無缺口", () => {
  const ranks = data.npcs.top100.map((n) => n.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 100 }, (_, i) => i + 1));
  for (const n of data.npcs.top100) assert.ok(n.name && n.name.length > 0);
});

test("npcs.json:⚠存疑角色正確標記disputed flag(35/40/47/55/66/67/87/93/96/100)", () => {
  const disputedRanks = data.npcs.top100.filter((n) => n.flags.includes("disputed")).map((n) => n.rank);
  assert.deepEqual(disputedRanks, [35, 40, 47, 55, 66, 67, 87, 93, 96, 100]);
});

test("npcs.json:#11-100皆有surpassReaction(十強走真容事件,不用此表)", () => {
  const withReaction = data.npcs.top100.filter((n) => n.rank >= 11).every((n) => !!n.surpassReaction);
  assert.equal(withReaction, true);
  const top10HaveReaction = data.npcs.top100.filter((n) => n.rank <= 10).some((n) => n.surpassReaction);
  assert.equal(top10HaveReaction, false);
});

// ---------- §9.7 levelSum 生成 ----------

test("bandLevelSum:排名帶內線性插值,數字小(靠前)levelSum高", () => {
  assert.equal(bandLevelSum(1, data.npcs.rankBandLevelSum), 1200);
  const v2 = bandLevelSum(2, data.npcs.rankBandLevelSum); // "2-3":[1050,1100]
  const v3 = bandLevelSum(3, data.npcs.rankBandLevelSum);
  assert.ok(v2 > v3);
  assert.ok(Math.abs(v2 - 1100) < 1e-9);
  assert.ok(Math.abs(v3 - 1050) < 1e-9);
});

test("jitteredLevelSum:±3%範圍內", () => {
  const base = 1000;
  for (const roll of [0, 0.5, 1]) {
    const v = jitteredLevelSum(base, () => roll);
    assert.ok(v >= base * 0.97 - 1e-9 && v <= base * 1.03 + 1e-9);
  }
});

test("generateNpcLevelSum:組合帶內插值+抖動", () => {
  const v = generateNpcLevelSum(50, data.npcs.rankBandLevelSum, () => 0.5);
  assert.ok(v > 0);
});

// ---------- §9.7.1 萬人總冊排名估算 ----------

test("estimateRankForLevelSum:levelSum在百強帶內時精確對到該排名", () => {
  assert.equal(estimateRankForLevelSum(1200, data.npcs.rankBandLevelSum), 1);
});

test("estimateRankForLevelSum:levelSum=0(創角剛開始)落在萬人區尾端", () => {
  const rank = estimateRankForLevelSum(0, data.npcs.rankBandLevelSum);
  assert.ok(rank >= 9000);
});

test("estimateRankForLevelSum:levelSum=60(§9.7.1「九成人<60」的分界)約落在第1000名附近", () => {
  const rank = estimateRankForLevelSum(60, data.npcs.rankBandLevelSum);
  assert.ok(Math.abs(rank - 1000) < 50);
});

test("percentileForRank:第1名百分位最高,第10000名接近0", () => {
  assert.equal(percentileForRank(1, 10000), 1);
  assert.ok(percentileForRank(10000, 10000) < 0.001);
});

test("rankingTierIndexForPercentile:對齊§8.1八階", () => {
  assert.equal(rankingTierIndexForPercentile(0.3), 1); // bottom50
  assert.equal(rankingTierIndexForPercentile(0.6), 2); // top50
  assert.equal(rankingTierIndexForPercentile(0.85), 3); // top20
  assert.equal(rankingTierIndexForPercentile(0.96), 4); // top5
  assert.equal(rankingTierIndexForPercentile(0.995), 5); // top1
  assert.equal(rankingTierIndexForPercentile(0.9995), 6); // top01
  assert.equal(rankingTierIndexForPercentile(0.9995, true), 7); // rank1
});

test("namedNpcAtRank:100名內回傳資料,100名外回null(萬人總冊無名記錄)", () => {
  assert.equal(namedNpcAtRank(1, data.npcs).name, "沈聽雪");
  assert.equal(namedNpcAtRank(101, data.npcs), null);
});

// ---------- §9.9 排位互動系統 ----------

test("integerMilestonesCrossed:排名進步時,回傳跨越的所有500整數關口", () => {
  assert.deepEqual(integerMilestonesCrossed(9000, 8400), [8500]);
  assert.deepEqual(integerMilestonesCrossed(5000, 3000), [4500, 4000, 3500]);
});

test("integerMilestonesCrossed:排名退步或不變時回空陣列", () => {
  assert.deepEqual(integerMilestonesCrossed(5000, 5000), []);
  assert.deepEqual(integerMilestonesCrossed(5000, 5200), []);
});

test("surpassedNpcs:排名進步時抓出區間內被超越的具名NPC", () => {
  const result = surpassedNpcs(105, 95, data.npcs);
  assert.ok(result.some((n) => n.rank === 100));
  assert.ok(result.every((n) => n.rank >= 95 && n.rank < 105));
});

test("surpassTier:十強/存疑/普通三檔分類正確", () => {
  const rank5 = data.npcs.top100.find((n) => n.rank === 5);
  const rank35 = data.npcs.top100.find((n) => n.rank === 35); // disputed
  const rank11 = data.npcs.top100.find((n) => n.rank === 11);
  assert.equal(surpassTier(rank5), "top10");
  assert.equal(surpassTier(rank35), "special");
  assert.equal(surpassTier(rank11), "normal");
});

test("surpassFameReward:排名越前獎勵越高", () => {
  assert.ok(surpassFameReward(1) > surpassFameReward(100));
  assert.equal(surpassFameReward(100), 1);
  assert.equal(surpassFameReward(1), 50);
});

// ---------- §9.6 聲望系統 ----------

test("addFame/addInfamy:獨立累積,不會扣到負值", () => {
  const rep = newReputation();
  addFame(rep, 10);
  addInfamy(rep, 5);
  assert.equal(rep.fame, 10);
  assert.equal(rep.infamy, 5);
  addFame(rep, -100);
  assert.equal(rep.fame, 0); // floor 0
});

test("tierIndexFor:依門檻表找目前階數", () => {
  const thresholds = [0, 50, 150, 350, 700, 1300, 2200];
  assert.equal(tierIndexFor(0, thresholds), 0);
  assert.equal(tierIndexFor(49, thresholds), 0);
  assert.equal(tierIndexFor(50, thresholds), 1);
  assert.equal(tierIndexFor(2200, thresholds), 6);
  assert.equal(tierIndexFor(99999, thresholds), 6); // 封頂在最高階
});

test("bucketOf:七階壓縮成三檔", () => {
  assert.equal(bucketOf(0), "Low");
  assert.equal(bucketOf(1), "Low");
  assert.equal(bucketOf(2), "Mid");
  assert.equal(bucketOf(4), "Mid");
  assert.equal(bucketOf(5), "High");
  assert.equal(bucketOf(6), "High");
});

test("evaluationText:俠名高惡名低→一代大俠;俠名低惡名高→一代魔頭", () => {
  const repData = loadJson("data/reputation.json");
  assert.equal(evaluationText(2000, 0, repData), "一代大俠");
  assert.equal(evaluationText(0, 2000, repData), "一代魔頭");
});

test("reputationSnapshot:回傳完整快照供UI引用", () => {
  const repData = loadJson("data/reputation.json");
  const rep = newReputation();
  addFame(rep, 2200); // 門檻表最高階為2200(見data/reputation.json,標記TBD待校準)
  const snap = reputationSnapshot(rep, repData);
  assert.equal(snap.fameTierLabel, "威震天下");
  assert.equal(snap.evaluation, "一代大俠");
});

test("hypocriteMultiplier:偽君子倍算,俠名階越高摔越重", () => {
  assert.equal(hypocriteMultiplier(10, 0), 10);  // 無俠名,不倍增
  assert.equal(hypocriteMultiplier(10, 3), 40);  // 俠名第3階,4倍
});

test("prodigalMultiplier:浪子回頭,惡名階越高俠名漲越快", () => {
  assert.equal(prodigalMultiplier(10, 0), 10);
  assert.equal(prodigalMultiplier(10, 3), 40);
});

// ---------- game.js 整合 ----------

test("updateRanking:data.npcs不存在時優雅跳過(向後相容,不報錯)", () => {
  const s = newState();
  const dataWithoutNpcs = { ...data, npcs: undefined };
  addSteps(s, 1000);
  const entry = resolveOneNeutral(s, dataWithoutNpcs);
  assert.equal(entry.ranking, null);
});

test("事件結算:超越具名NPC時獲得俠名獎勵+記flag,且同一NPC只觸發一次", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  for (const id of data.events.config.intro.sequence) {
    s.journal.push({ n: 0, id, date: "2026-08-01" }); // 跳過序章,直接抽隨機池
  }

  // 第一次結算:六維皆0,建立排名基準線(lastKnownRank≈9000+);首次呼叫不算「超越」
  addSteps(s, 3000);
  resolveOneNeutral(s, data);
  assert.equal(s.reputation.fame, 0);

  // 練到 levelSum 遠超過第100名門檻(約165),確保下次結算會偵測到大量超越
  for (const dim of ["light", "inner", "hard", "soft", "eye", "ear"]) {
    addExp(s, { [dim]: 100000 }, data);
  }
  const entry = resolveOneNeutral(s, data);

  assert.ok(entry.ranking);
  assert.ok(entry.ranking.surpassed.length > 0);
  assert.ok(s.reputation.fame > 0);
  const someNpc = entry.ranking.surpassed[0];
  assert.ok(s.flags[`surpassed_${someNpc.rank}`]);

  // 再結算一次事件,排名沒再變動,不應該對同一批NPC重複發獎勵
  const fameAfterFirst = s.reputation.fame;
  resolveOneNeutral(s, data);
  assert.equal(s.reputation.fame, fameAfterFirst);
});
