import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SIX_TRIALS, newTrialProgress, recordTrialProgress, isTrialComplete,
  breakthroughProbability, recoveredAttemptLevel, attemptBreakthrough,
  rollBreakthroughMagnitude
} from "../src/engine/rebirth.js";
import {
  newState, createCharacter, damageResource, logExercise,
  startNextEvent, addSteps, attemptRebirthCompletion, resourceMax
} from "../src/engine/game.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  events: loadJson("data/events.json"),
  titles: loadJson("data/titles.json"),
  items: loadJson("data/items.json"),
  tags: loadJson("data/tags.json"),
  quiz: loadJson("data/quiz.json")
};

// ---------- 六大試煉(§5.1) ----------

test("SIX_TRIALS:六項且目標值符合總綱(30/30/100/100/100/100)", () => {
  assert.equal(SIX_TRIALS.length, 6);
  const targets = Object.fromEntries(SIX_TRIALS.map((t) => [t.exerciseId, t.target]));
  assert.deepEqual(targets, {
    paobu: 30, yujia: 30, fudi: 100, yangwoqizuo: 100, shendun: 100, jiaohudunetiao: 100
  });
});

test("newTrialProgress/recordTrialProgress/isTrialComplete:未達標與達標判定", () => {
  const p = newTrialProgress();
  assert.equal(isTrialComplete(p), false);
  for (const t of SIX_TRIALS) recordTrialProgress(p, t.exerciseId, t.target);
  assert.equal(isTrialComplete(p), true);
});

test("recordTrialProgress:非六大試煉項目的運動不計入", () => {
  const p = newTrialProgress();
  recordTrialProgress(p, "lanqiu", 9999); // 籃球不在六大試煉裡
  assert.equal(isTrialComplete(p), false);
  assert.ok(!("lanqiu" in p));
});

test("recordTrialProgress:可分次累積", () => {
  const p = newTrialProgress();
  recordTrialProgress(p, "fudi", 40);
  recordTrialProgress(p, "fudi", 30);
  recordTrialProgress(p, "fudi", 30);
  assert.equal(p.fudi, 100);
});

// ---------- 方案B機率遞減(§5.2) ----------

test("breakthroughProbability:第1/2/3次依序100%/50%/25%,第4次起殘值5%", () => {
  assert.equal(breakthroughProbability(1), 1.0);
  assert.equal(breakthroughProbability(2), 0.5);
  assert.equal(breakthroughProbability(3), 0.25);
  assert.equal(breakthroughProbability(4), 0.05);
  assert.equal(breakthroughProbability(10), 0.05);
});

test("recoveredAttemptLevel:每30天回復一級,最低回到第1級", () => {
  assert.equal(recoveredAttemptLevel(4, 0), 4);
  assert.equal(recoveredAttemptLevel(4, 29), 4);
  assert.equal(recoveredAttemptLevel(4, 30), 3);
  assert.equal(recoveredAttemptLevel(4, 90), 1);
  assert.equal(recoveredAttemptLevel(4, 9999), 1);
});

test("attemptBreakthrough:第1次重生必定成功(機率100%)", () => {
  const r = attemptBreakthrough(1, () => 0.999999);
  assert.equal(r.success, true);
  assert.equal(r.probability, 1.0);
  assert.ok([1, 2, 3].includes(r.amount));
});

test("attemptBreakthrough:第4次起幾乎必定失敗(機率僅5%)", () => {
  const r = attemptBreakthrough(4, () => 0.5);
  assert.equal(r.success, false);
  assert.equal(r.amount, 0);
});

test("rollBreakthroughMagnitude:累積機率表90%/9%/1%對應+1/+2/+3", () => {
  assert.equal(rollBreakthroughMagnitude(() => 0.5), 1);
  assert.equal(rollBreakthroughMagnitude(() => 0.95), 2);
  assert.equal(rollBreakthroughMagnitude(() => 0.999), 3);
});

// ---------- game.js 整合:死亡→重生→試煉→復活全流程 ----------

test("重生中無法觸發新事件(§5.1)", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  damageResource(s, "hp", s.resources.hp);
  s.rebirth = { progress: newTrialProgress() };

  addSteps(s, 1000);
  const ev = startNextEvent(s, data, () => 0.5);
  assert.equal(ev, null);
});

test("logExercise 在重生中會同步累積六大試煉進度", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  s.rebirth = { progress: newTrialProgress() };
  logExercise(s, data, "fudi", 60, "2026-01-01");
  assert.equal(s.rebirth.progress.fudi, 60);
});

test("attemptRebirthCompletion:試煉未達標時回 null,狀態不變", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  s.rebirth = { progress: newTrialProgress() };
  const result = attemptRebirthCompletion(s, "2026-01-01", () => 0.5);
  assert.equal(result, null);
  assert.ok(s.rebirth);
});

test("attemptRebirthCompletion:全流程——歸零→試煉達標→復活滿值→首次重生必定根骨突破", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  const gengguBefore = s.talents.genggu;

  damageResource(s, "hp", s.resources.hp);
  s.rebirth = { progress: newTrialProgress() };
  for (const t of SIX_TRIALS) recordTrialProgress(s.rebirth.progress, t.exerciseId, t.target);

  const result = attemptRebirthCompletion(s, "2026-01-01", () => 0.01);
  assert.ok(result);
  assert.equal(result.success, true);
  assert.equal(result.attemptLevel, 1);
  assert.equal(s.rebirth, null);
  assert.equal(s.rebirthCount, 1);
  assert.equal(s.lastRebirthDate, "2026-01-01");

  const max = resourceMax(s);
  assert.equal(s.resources.hp, max.hp);
  assert.equal(s.resources.qi, max.qi);
  assert.equal(s.resources.tili, max.tili);
  assert.equal(s.talents.genggu, gengguBefore + result.amount);

  addSteps(s, 1000);
  const ev = startNextEvent(s, data, () => 0.99);
  assert.ok(ev);
});

test("attemptRebirthCompletion:連續死亡防刷——第2次重生機率降到50%(30天內不回復)", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);

  damageResource(s, "hp", s.resources.hp);
  s.rebirth = { progress: newTrialProgress() };
  for (const t of SIX_TRIALS) recordTrialProgress(s.rebirth.progress, t.exerciseId, t.target);
  attemptRebirthCompletion(s, "2026-01-01", () => 0.01);
  assert.equal(s.rebirthCount, 1);

  damageResource(s, "hp", s.resources.hp);
  s.rebirth = { progress: newTrialProgress() };
  for (const t of SIX_TRIALS) recordTrialProgress(s.rebirth.progress, t.exerciseId, t.target);
  const result2 = attemptRebirthCompletion(s, "2026-01-02", () => 0.4);
  assert.equal(result2.attemptLevel, 2);
  assert.equal(result2.probability, 0.5);
  assert.equal(result2.success, true);
});

test("attemptRebirthCompletion:間隔滿30天,防刷等級回復一級", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);

  damageResource(s, "hp", s.resources.hp);
  s.rebirth = { progress: newTrialProgress() };
  for (const t of SIX_TRIALS) recordTrialProgress(s.rebirth.progress, t.exerciseId, t.target);
  attemptRebirthCompletion(s, "2026-01-01", () => 0.01);

  damageResource(s, "hp", s.resources.hp);
  s.rebirth = { progress: newTrialProgress() };
  for (const t of SIX_TRIALS) recordTrialProgress(s.rebirth.progress, t.exerciseId, t.target);
  const result2 = attemptRebirthCompletion(s, "2026-01-31", () => 0.4);
  assert.equal(result2.attemptLevel, 1);
  assert.equal(result2.probability, 1.0);
});
