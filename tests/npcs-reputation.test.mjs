import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  bandLevelSum, jitteredLevelSum, generateNpcLevelSum,
  estimateRankForLevelSum, percentileForRank, rankingTierIndexForPercentile, revealsRanking,
  playerRankSnapshot, namedNpcAtRank,
  integerMilestonesCrossed, surpassedNpcs, surpassTier, surpassFameReward
} from "../src/engine/npcs.js";
import {
  newReputation, addFame, addInfamy, tierIndexFor, bucketOf,
  evaluationText, reputationSnapshot, hypocriteMultiplier, prodigalMultiplier
} from "../src/engine/reputation.js";
import {
  newState, createCharacter, addExp, chooseOption, startNextEvent, addSteps, revealRanking
} from "../src/engine/game.js";
import { eligibleEvents } from "../src/engine/events2.js";

/** 結算一個「B選項無任何效果」的日常事件,輪換避開冷卻 */
const NEUTRAL_EVENTS = ["DA-003_rain_shelter", "DA-001_teahouse_storyteller", "DA-002_sugar_figurine"];
let neutralIdx = 0;
/** 指定事件 id 結算一次(閘門測試要能挑到特定地域的事件) */
function resolveOne(s, useData, id) {
  const candidates = eligibleEvents(s, useData, "2026-08-19");
  const idx = candidates.findIndex((c) => c.ev.eventId === id);
  if (idx < 0) throw new Error(`事件 ${id} 這一刻抽不到`);
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  startNextEvent(s, useData, "2026-08-19", () => (idx + 0.5) / total);
  return chooseOption(s, useData, "B", "2026-08-19").entry;
}

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
  const [lo23, hi23] = data.npcs.rankBandLevelSum["2-3"];
  assert.equal(bandLevelSum(1, data.npcs.rankBandLevelSum), data.npcs.rankBandLevelSum["1"][0]);
  const v2 = bandLevelSum(2, data.npcs.rankBandLevelSum);
  const v3 = bandLevelSum(3, data.npcs.rankBandLevelSum);
  assert.ok(v2 > v3);
  assert.ok(Math.abs(v2 - hi23) < 1e-9);
  assert.ok(Math.abs(v3 - lo23) < 1e-9);
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
  assert.equal(estimateRankForLevelSum(data.npcs.rankBandLevelSum["1"][0], data.npcs.rankBandLevelSum), 1);
});

test("estimateRankForLevelSum:levelSum=0(創角剛開始)落在總冊尾端(§9.7.1 #900,000 開外)", () => {
  const rank = estimateRankForLevelSum(0, data.npcs.rankBandLevelSum);
  assert.ok(rank >= 900000, `rank=${rank}`);
});

// ⚠️ §9.7.1 原本寫「總冊九成人 levelSum<60」,與 2026-08-21 定調的「練一週只贏得了一千人」
// 相矛盾(見總綱 §9.7.1 的修訂註記)。以設計者當面給的校準點為準。
test("校準點:練一週的量(levelSum 20)約贏過一千人", () => {
  const rank = estimateRankForLevelSum(20, data.npcs.rankBandLevelSum);
  const beaten = 1000000 - rank;
  assert.ok(beaten > 700 && beaten < 1500, `贏過 ${beaten} 人`);
});

test("底部很黏:levelSum 7 只贏過幾百人,不會一口氣噴掉十幾萬名", () => {
  const beaten = 1000000 - estimateRankForLevelSum(7, data.npcs.rankBandLevelSum);
  assert.ok(beaten < 1000, `贏過 ${beaten} 人`);
});

test("中段最擠:levelSum 從 96 到 138,名次推進遠快過從 0 到 40", () => {
  const r = (L) => estimateRankForLevelSum(L, data.npcs.rankBandLevelSum);
  assert.ok((r(96) - r(138)) > (r(0) - r(40)) * 100, "S 型分布的中段就是要擠");
});

test("差一點就是差一點:沒摸到百強門檻就進不了前 100", () => {
  const top100 = data.npcs.rankBandLevelSum["91-100"][0];
  assert.ok(estimateRankForLevelSum(top100 - 1, data.npcs.rankBandLevelSum) > 100);
  assert.ok(estimateRankForLevelSum(top100, data.npcs.rankBandLevelSum) <= 100);
});

test("estimateRankForLevelSum:摸到百強門檻就進得了前 100", () => {
  const top100 = data.npcs.rankBandLevelSum["91-100"][0];
  const rank = estimateRankForLevelSum(top100, data.npcs.rankBandLevelSum);
  assert.ok(rank <= 100, `rank=${rank}`);
});

test("天下第一的門檻:兩年份的苦練(§9.7.3 2026-08-21 校準)", () => {
  assert.equal(estimateRankForLevelSum(data.npcs.rankBandLevelSum["1"][0], data.npcs.rankBandLevelSum), 1);
});

test("percentileForRank:第1名百分位最高,最後一名接近0", () => {
  assert.equal(percentileForRank(1, 1000000), 1);
  assert.ok(percentileForRank(1000000, 1000000) < 0.001);
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

test("integerMilestonesCrossed:排名進步時,回傳跨越的所有五萬整數關口", () => {
  assert.deepEqual(integerMilestonesCrossed(900000, 840000), [850000]);
  assert.deepEqual(integerMilestonesCrossed(500000, 300000), [450000, 400000, 350000, 300000]);
});

test("integerMilestonesCrossed:名次剛好停在關口上也算跨過(否則那道關口永遠不播)", () => {
  assert.deepEqual(integerMilestonesCrossed(900000, 850000), [850000]);
  assert.deepEqual(integerMilestonesCrossed(850000, 849999), []); // 850,000 已在上一次報過
});

test("integerMilestonesCrossed:排名退步或不變時回空陣列", () => {
  assert.deepEqual(integerMilestonesCrossed(500000, 500000), []);
  assert.deepEqual(integerMilestonesCrossed(500000, 520000), []);
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

test("revealRanking:data.npcs不存在時優雅跳過(向後相容,不報錯)", () => {
  const s = newState();
  assert.equal(revealRanking(s, { ...data, npcs: undefined }), null);
});

test("revealRanking:第一次看榜只是知道自己在哪,不算超越任何人", () => {
  const s = newState();
  for (const dim of ["light", "inner", "hard", "soft", "eye", "ear"]) {
    addExp(s, { [dim]: 100000 }, data); // 直接練到百強水準
  }
  const first = revealRanking(s, data, "2026-08-19", "榜文");
  assert.equal(first.firstTime, true);
  assert.equal(first.surpassed.length, 0);
  assert.equal(s.reputation.fame, 0, "沒看過榜之前的名次變動不發俠名(§9.6.1 見證原則)");
  assert.deepEqual(s.rankSeen, { date: "2026-08-19", source: "榜文" });
});

test("revealRanking:看榜時結算超越——發俠名、記flag,同一人只算一次", () => {
  const s = newState();
  revealRanking(s, data, "2026-08-19", "榜文"); // 六維皆0,先立基準
  assert.equal(s.reputation.fame, 0);

  for (const dim of ["light", "inner", "hard", "soft", "eye", "ear"]) {
    addExp(s, { [dim]: 100000 }, data);
  }
  assert.equal(s.reputation.fame, 0, "練功當下不會憑空長俠名,得等下次看榜");

  const result = revealRanking(s, data, "2026-08-20", "榜文");
  assert.ok(result.surpassed.length > 0);
  assert.ok(s.reputation.fame > 0);
  assert.ok(s.flags[`surpassed_${result.surpassed[0].rank}`]);

  const fameAfterFirst = s.reputation.fame;
  revealRanking(s, data, "2026-08-21", "榜文");
  assert.equal(s.reputation.fame, fameAfterFirst, "名次沒再動,不重複發獎");
});

// ---------- 得知管道的閘門(§9.9) ----------

test("revealsRanking:城鎮地域看得到榜文", () => {
  assert.equal(revealsRanking({ region: ["中原小鎮"] }), "榜文");
  assert.equal(revealsRanking({ region: ["夜市"] }), "榜文");
  assert.equal(revealsRanking({ region: ["官道茶棚"] }), "榜文");
});

test("revealsRanking:遇上司天監的人也算得知(含遠觀)", () => {
  assert.equal(revealsRanking({ character: ["司天監(遠觀)"] }), "監使");
});

test("revealsRanking:〔排行相關〕標籤一律算榜文", () => {
  assert.equal(revealsRanking({ event: ["排行相關"] }), "榜文");
});

test("revealsRanking:荒郊野外看不到榜", () => {
  assert.equal(revealsRanking({ region: ["官道", "屋簷"], character: ["蓑衣漢子(留白)"] }), null);
  assert.equal(revealsRanking({ region: ["山道", "斷崖"] }), null);
  assert.equal(revealsRanking(null), null);
});

test("事件結算:荒郊事件不動名次,城鎮事件才揭曉", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  for (const id of data.events.config.intro.sequence) {
    s.journal.push({ n: 0, id, date: "2026-08-01" });
  }
  addSteps(s, 5000);

  const wild = resolveOne(s, data, "DA-003_rain_shelter"); // 官道/屋簷
  assert.equal(wild.rankingRevealedBy, null);
  assert.equal(wild.ranking, null);
  assert.equal(s.lastKnownRank, null, "沒看到榜,就是不知道自己排第幾");

  const town = resolveOne(s, data, "DA-001_teahouse_storyteller"); // 官道茶棚
  assert.equal(town.rankingRevealedBy, "榜文");
  assert.ok(town.ranking);
  assert.ok(s.lastKnownRank > 0);
  assert.equal(s.rankSeen.source, "榜文");
});
