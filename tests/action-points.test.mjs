// 行動力互換驗收(2026-08-21 設計者定調:有運動都能推進江湖路;走路也長六維)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  newState, logExercise, logSteps, exerciseStepEquivalent,
  pendingEventCount, STEPS_PER_EVENT, MAX_DAILY_STEPS
} from "../src/engine/game.js";
import { startTraining, stopTraining } from "../src/engine/training.js";
import { DIMENSIONS } from "../src/engine/exp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  titles: loadJson("data/titles.json")
};
const exOf = (id) => data.exercises.exercises.find((e) => e.id === id);
const RATE = data.exercises.actionPoints.stepsPerWeightPoint;

// ---------- 匯率的錨:快走 ----------

test("錨點對得上:快走 10 分鐘 ≈ 1000 步,和真實走 10 分鐘同一個量級", () => {
  const steps = exerciseStepEquivalent(exOf("kuaizou"), 10, data);
  assert.equal(steps, 1000);
  assert.equal(steps, STEPS_PER_EVENT, "剛好一次事件");
});

test("跑步比快走值錢(同樣時間,強度較高)", () => {
  assert.ok(exerciseStepEquivalent(exOf("paobu"), 10, data)
    > exerciseStepEquivalent(exOf("kuaizou"), 10, data));
});

test("匯率就是資料檔那個數字,沒有藏第二套公式", () => {
  const ex = exOf("fudi");
  const weightSum = Object.values(ex.weights).reduce((a, b) => a + b, 0);
  assert.equal(exerciseStepEquivalent(ex, 20, data), Math.round(20 * weightSum * RATE));
});

// ---------- 運動推進江湖路 ----------

test("登記運動會長行動力,列進 steps.total", () => {
  const s = newState();
  const { actionSteps } = logExercise(s, data, "shendun", 100, "2026-08-21");
  assert.equal(actionSteps, 963, "深蹲 100 下(遞減後有效量 70)× 權重和 11 × 1.25");
  assert.equal(s.steps.total, actionSteps);
  assert.equal(s.steps.fromExercise, actionSteps);
});

test("行動力累積到 1000 就推得動江湖路", () => {
  const s = newState();
  assert.equal(pendingEventCount(s), 0);
  logExercise(s, data, "kuaizou", 20, "2026-08-21"); // 快走 20 分鐘
  assert.ok(s.steps.total >= STEPS_PER_EVENT, `total=${s.steps.total}`);
  assert.ok(pendingEventCount(s) >= 1);
});

test("行動力吃遞減:同一項狂練,後面的量換到的步數變少", () => {
  const a = newState();
  const first = logExercise(a, data, "fudi", 20, "2026-08-21").actionSteps;
  const second = logExercise(a, data, "fudi", 20, "2026-08-21").actionSteps;
  assert.ok(second < first, `${first} → ${second}`);
});

test("計時修煉收功也回報行動力", () => {
  const s = newState();
  startTraining(s, data, "paobu", 0);
  const res = stopTraining(s, data, "2026-08-21", 30 * 60_000);
  assert.equal(res.minutes, 30);
  assert.ok(res.actionSteps > 0);
  assert.equal(s.steps.fromExercise, res.actionSteps);
});

test("一小時球類運動落在合理的步數量級(不會誇張到取代走路)", () => {
  const s = newState();
  const { actionSteps } = logExercise(s, data, "lanqiu", 60, "2026-08-21");
  assert.ok(actionSteps > 3000 && actionSteps < 12000, `籃球一小時 = ${actionSteps} 步`);
});

// ---------- 走路長六維 ----------

test("走路長六維:一步每維 +0.001,六維均分", () => {
  const s = newState();
  const perStep = data.exercises.walking.expPerStepPerDimension;
  const res = logSteps(s, data, 8000, "2026-08-21");
  for (const d of DIMENSIONS) {
    assert.ok(Math.abs(s.exp[d] - 8000 * perStep) < 1e-9);
  }
  assert.equal(res.applied, 8000);
});

test("走路的六維遠少於同等行動力的運動——路是路,功是功", () => {
  const walker = newState();
  logSteps(walker, data, 10000, "2026-08-21");
  const walkExp = DIMENSIONS.reduce((a, d) => a + walker.exp[d], 0);

  const trainer = newState();
  logExercise(trainer, data, "kuaizou", 100, "2026-08-21"); // 折算約一萬步的量級
  const trainExp = DIMENSIONS.reduce((a, d) => a + trainer.exp[d], 0);

  assert.ok(trainExp > walkExp, `練功 ${trainExp} 應該多過走路 ${walkExp}`);
});

test("兩條來源分帳:走路與運動各記各的,加起來等於總行動力", () => {
  const s = newState();
  logSteps(s, data, 6000, "2026-08-21");
  const { actionSteps } = logExercise(s, data, "yujia", 30, "2026-08-21");
  assert.equal(s.steps.fromWalking, 6000);
  assert.equal(s.steps.fromExercise, actionSteps);
  assert.equal(s.steps.total, 6000 + actionSteps);
});

test("單日步數上限仍然管用,運動不會繞過它", () => {
  const s = newState();
  logSteps(s, data, 99999, "2026-08-21");
  assert.equal(s.steps.fromWalking, MAX_DAILY_STEPS);
});
