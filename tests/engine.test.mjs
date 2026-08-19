import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { effectiveAmount, currentCoefficient } from "../src/engine/decay.js";
import { thresholdForLevel, levelFromExp, milestoneTitle } from "../src/engine/exp.js";
import { successRate, weightedStatValue } from "../src/engine/check.js";
import {
  newState, logExercise, addSteps, logSteps, pendingEventCount,
  startNextEvent, chooseOption, chooseSub, useItem, gainItem, levels, createCharacter,
  MAX_DAILY_STEPS, WARN_DAILY_STEPS
} from "../src/engine/game.js";
import {
  startTraining, stopTraining, cancelTraining, trainingElapsedMs
} from "../src/engine/training.js";

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

// ---------- §3 遞減 ----------

test("規格範例:跑步50分鐘 → 有效44分 → 輕功2640", () => {
  const eff = effectiveAmount(0, 50, 20);
  assert.equal(eff, 44);
  assert.equal(eff * 60, 2640);
});

test("規格範例:跑步30分鐘 → 輕功1710", () => {
  const eff = effectiveAmount(0, 30, 20);
  assert.equal(eff * 60, 1710);
});

test("拆單與整批結果相同(杜絕洗分)", () => {
  const whole = effectiveAmount(0, 95, 20);
  let split = 0, cum = 0;
  for (const chunk of [7, 13, 20, 5, 50]) {
    split += effectiveAmount(cum, chunk, 20);
    cum += chunk;
  }
  assert.ok(Math.abs(whole - split) < 1e-9);
});

test("第5階以後封底40%", () => {
  // 已累積100分(20分/階,第5階起),再跑40分全部 ×0.4
  assert.equal(effectiveAmount(100, 40, 20), 16);
  assert.equal(currentCoefficient(100, 20), 0.4);
  assert.equal(currentCoefficient(0, 20), 1);
});

// ---------- §1 等級門檻 ----------

test("等級門檻 100×N×(N+1)÷2", () => {
  assert.equal(thresholdForLevel(1), 100);
  assert.equal(thresholdForLevel(2), 300);
  assert.equal(thresholdForLevel(6), 2100);
  assert.equal(levelFromExp(0), 0);
  assert.equal(levelFromExp(99), 0);
  assert.equal(levelFromExp(100), 1);
  assert.equal(levelFromExp(299), 1);
  assert.equal(levelFromExp(300), 2);
  assert.equal(levelFromExp(2100), 6);
  assert.equal(levelFromExp(2099), 5);
});

// ---------- §4.4 成功率 ----------

test("成功率公式與 5%~95% 上下限", () => {
  assert.equal(successRate(3, 3), 0.5);
  assert.equal(successRate(6, 3), 0.95); // 50%+50% → 夾 95%
  assert.equal(successRate(0, 3), 0.05); // 50%-50% → 夾 5%
  assert.equal(successRate(4, 3, -0.1), 0.5 + (1 / 3) * 0.5 - 0.1);
});

test("多項加權基本功值", () => {
  const v = weightedStatValue({ hard: 0.5, inner: 0.5 }, { hard: 4, inner: 2 });
  assert.equal(v, 3);
});

// ---------- 練功結算鏈 ----------

test("logExercise:遞減 → 權重 → 經驗池 → 等級", () => {
  const s = newState();
  const { effective, gains } = logExercise(s, data, "paobu", 50, "2026-08-14");
  assert.equal(effective, 44);
  assert.equal(gains.light, 2640);
  assert.equal(s.exp.light, 2640);
  assert.equal(s.exp.inner, 2640);
  assert.equal(levels(s).light, 6); // 2640 ≥ 2100(Lv6)
});

test("同日第二筆接續遞減、隔日歸零", () => {
  const s = newState();
  logExercise(s, data, "paobu", 20, "2026-08-14");
  const r2 = logExercise(s, data, "paobu", 20, "2026-08-14");
  assert.equal(r2.effective, 17); // 第2階 85%
  const r3 = logExercise(s, data, "paobu", 20, "2026-08-15");
  assert.equal(r3.effective, 20); // 隔日回到 100%
});

test("距離型運動:間歇衝刺以每100公尺計權重", () => {
  const s = newState();
  const { gains } = logExercise(s, data, "chongci", 300, "2026-08-14");
  assert.equal(gains.light, 150); // 300m 全在第1階 → 3單位 × 50
});

test("里程碑永久保留,扣分不會摘除稱號(§8.2:門檻改用等級)", () => {
  const s = newState();
  s.exp.light = 5499; // thresholdForLevel(9)=4500 ≤ 5499 < thresholdForLevel(10)=5500,尚為Lv.9
  logExercise(s, data, "tiaosheng", 10, "2026-08-14"); // 輕功 +16 → 5515,跨過Lv.10門檻
  assert.equal(s.milestones.light, 0); // 解鎖「掠影追風」
  s.exp.light = 100; // 模擬大量扣分,等級掉回0
  assert.equal(s.milestones.light, 0); // 稱號仍在
  const t = data.titles.milestones;
  assert.equal(milestoneTitle(10, t.thresholds, t.titles.light), "掠影追風"); // 現在拿等級去比,不是經驗值
});

// ---------- 計時修煉 ----------

test("計時修煉:實際計時30分鐘跑步 → 輕功1710", () => {
  const s = newState();
  startTraining(s, data, "paobu", 0);
  assert.equal(trainingElapsedMs(s, 90_000), 90_000);
  const res = stopTraining(s, data, "2026-08-14", 30 * 60_000);
  assert.equal(res.minutes, 30);
  assert.equal(s.exp.light, 1710);
  assert.equal(s.training, null);
});

test("計時修煉:不足一分鐘不登記", () => {
  const s = newState();
  startTraining(s, data, "paobu", 0);
  const res = stopTraining(s, data, "2026-08-14", 59_000);
  assert.equal(res, null);
  assert.equal(s.exp.light, 0);
  assert.equal(s.training, null);
});

test("計時修煉:按次運動不可計時、進行中擋重複開始", () => {
  const s = newState();
  assert.throws(() => startTraining(s, data, "fudi", 0));
  startTraining(s, data, "paobu", 0);
  assert.throws(() => startTraining(s, data, "kuaizou", 5));
  cancelTraining(s);
  assert.equal(s.training, null);
  assert.equal(s.exp.light, 0);
});

test("計時修煉:單次以 maxSessionMinutes 封頂", () => {
  const s = newState();
  startTraining(s, data, "paobu", 0);
  const res = stopTraining(s, data, "2026-08-14", 10 * 3600_000); // 掛機10小時
  assert.equal(res.minutes, data.exercises.maxSessionMinutes);
});

// ---------- 步數登記規則 ----------

test("logSteps:每日一次、單日封頂、兩萬步標記", () => {
  const s = newState();
  const r1 = logSteps(s, 8000, "2026-08-14");
  assert.deepEqual(r1, { applied: 8000, capped: false, warned: false });
  assert.throws(() => logSteps(s, 100, "2026-08-14")); // 同日重複擋下
  const r2 = logSteps(s, 99999, "2026-08-13");         // 封頂
  assert.equal(r2.applied, MAX_DAILY_STEPS);
  assert.ok(r2.capped && r2.warned);
  const r3 = logSteps(s, WARN_DAILY_STEPS, "2026-08-12");
  assert.ok(r3.warned && !r3.capped);
  assert.equal(s.steps.total, 8000 + MAX_DAILY_STEPS + WARN_DAILY_STEPS);
});

test("logSteps:舊存檔沒有 byDate 也能登記", () => {
  const s = newState();
  delete s.steps.byDate;
  logSteps(s, 5000, "2026-08-14");
  assert.equal(s.steps.byDate["2026-08-14"], 5000);
  assert.equal(s.steps.total, 5000);
});

// ---------- 步數與事件(v2 事件庫細節測試見 events2.test.mjs) ----------

test("每1000步觸發一次事件,一次輸入依序結算", () => {
  const s = newState();
  addSteps(s, 3500);
  assert.equal(pendingEventCount(s), 3);
  for (let i = 0; i < 3; i++) {
    const ev = startNextEvent(s, data, "2026-08-19", () => 0.99);
    assert.ok(ev);
    const view = { ...s.pendingEvent };
    // 挑第一個可見選項結算(daily/choice 皆可走)
    const evDef = data.events.pool.find((e) => e.eventId === view.id);
    const first = evDef.beats.cheng.choices.find((c) => !c.requirePerception && !c.requireCrush && !c.autoWhenInsufficient);
    const res = chooseOption(s, data, first ? first.id : null, "2026-08-19", () => 0.99);
    if (!res.done) {
      // 巢狀抉擇:挑第一個子選項收尾
      const subs = s.pendingEvent;
      assert.equal(subs.phase, "sub");
      const evDef2 = data.events.pool.find((e) => e.eventId === subs.id);
      let o = evDef2.beats.he.byChoice[subs.subSource];
      if (subs.subBranch) o = o[subs.subBranch];
      chooseSub(s, data, o.subChoices[0].id, "2026-08-19");
    }
  }
  assert.equal(pendingEventCount(s), 0);
  assert.equal(startNextEvent(s, data, "2026-08-19", () => 0.99), null);
  assert.equal(s.journal.length, 3);
});

test("療傷藥仍可解除舊版 debuff(M4殘留,物品系統相容)", () => {
  const s = newState();
  s.debuffs.push("dieda");
  gainItem(s, data, "liaoshangyao");
  const cured = useItem(s, data, "liaoshangyao");
  assert.equal(cured, "dieda");
  assert.equal(s.debuffs.length, 0);
  assert.equal(s.inventory["liaoshangyao"], undefined);
});
