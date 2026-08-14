import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { effectiveAmount, currentCoefficient } from "../src/engine/decay.js";
import { thresholdForLevel, levelFromExp, milestoneTitle } from "../src/engine/exp.js";
import { successRate, weightedStatValue } from "../src/engine/check.js";
import {
  newState, logExercise, addSteps, pendingEventCount,
  startNextEvent, resolveEvent, useItem, gainItem, levels
} from "../src/engine/game.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  events: loadJson("data/events.json"),
  titles: loadJson("data/titles.json"),
  items: loadJson("data/items.json")
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

test("里程碑永久保留,扣分不會摘除稱號", () => {
  const s = newState();
  s.exp.light = 4999;
  logExercise(s, data, "tiaosheng", 10, "2026-08-14"); // 輕功 +16
  assert.equal(s.milestones.light, 0); // 解鎖「掠影追風」
  s.exp.light = 100; // 模擬大量扣分
  assert.equal(s.milestones.light, 0); // 稱號仍在
  const t = data.titles.milestones;
  assert.equal(milestoneTitle(5000, t.thresholds, t.titles.light), "掠影追風");
});

// ---------- 步數與事件 ----------

test("每1000步觸發一次事件,一次輸入依序結算", () => {
  const s = newState();
  addSteps(s, 3500);
  assert.equal(pendingEventCount(s), 3);
  const rng = () => 0.99; // 不啟動支線,抽池子最後一個
  for (let i = 0; i < 3; i++) {
    const ev = startNextEvent(s, data, rng);
    assert.ok(ev);
    resolveEvent(s, data, rng, ev.type === "choice" ? 0 : null);
  }
  assert.equal(pendingEventCount(s), 0);
  assert.equal(startNextEvent(s, data, rng), null);
  assert.equal(s.journal.length, 3);
});

test("支線全程成功:四階段完成並取得秘笈", () => {
  const s = newState();
  addSteps(s, 4000);
  const rng = () => 0.01; // 必啟動支線、判定必成功
  for (let i = 0; i < 4; i++) {
    const ev = startNextEvent(s, data, rng);
    assert.equal(ev.source, "quest");
    resolveEvent(s, data, rng, null);
  }
  assert.equal(s.quest.status, "done");
  assert.equal(s.inventory["miji-zangfeng"], 1);
  assert.equal(s.inventory["zangfeng-pai"], undefined); // 木牌已交出
  assert.ok(s.flags.zangfeng_done);
  assert.equal(s.exp.light, 150 + 300); // 攔路獎勵 + 秘笈加成
  assert.equal(s.exp.eye, 150 + 300);   // 尋路獎勵 + 秘笈加成
});

test("支線失敗可重啟,不會卡死", () => {
  const s = newState();
  addSteps(s, 10000);
  // 第一階段(敘事)啟動
  let rng = () => 0.01;
  startNextEvent(s, data, rng);
  resolveEvent(s, data, rng, null);
  assert.equal(s.quest.status, "active");
  // 第二階段判定失敗 → 支線中斷
  startNextEvent(s, data, rng);
  resolveEvent(s, data, () => 0.999, null);
  assert.equal(s.quest.status, "failed");
  assert.equal(s.quest.stage, 0);
  // 之後隨機抽選中有機率從頭重啟
  const ev = startNextEvent(s, data, () => 0.01);
  assert.equal(ev.source, "quest");
  assert.equal(ev.id, "zf-1");
});

test("debuff 影響成功率且不自動消退;療傷藥可解除", () => {
  const s = newState();
  s.debuffs.push("dieda");
  addSteps(s, 1000);
  // 抽到對決事件(醉漢):以「過濾後」的池子計算抽選位置
  const filtered = data.events.randomPool.filter(
    (e) => !(e.requiresFlag && !s.flags[e.requiresFlag]) && !(e.once && s.seenOnce.includes(e.id))
  );
  const idx = filtered.findIndex((e) => e.id === "duel-zuihan");
  const drawRng = (() => {
    let calls = 0;
    return () => (calls++ === 0 ? 0.99 : (idx + 0.5) / filtered.length);
  })();
  const ev = startNextEvent(s, data, drawRng);
  assert.equal(ev.id, "duel-zuihan");
  // Lv0 vs 難度1 → 5% 下限;debuff 再 -10% 仍夾在 5%
  resolveEvent(s, data, () => 0.5, null);
  assert.equal(s.journal[0].success, false);
  assert.ok(s.debuffs.includes("dieda")); // 不會自動消退
  gainItem(s, data, "liaoshangyao");
  const cured = useItem(s, data, "liaoshangyao");
  assert.equal(cured, "dieda");
  assert.equal(s.debuffs.length, 0);
  assert.equal(s.inventory["liaoshangyao"], undefined);
});

test("懲罰扣分不會扣到負值", () => {
  const s = newState();
  s.exp.soft = 3;
  // fortune-laoyuan 失敗扣 soft 10,經驗池應停在 0
  addSteps(s, 1000);
  const filtered = data.events.randomPool.filter(
    (e) => !(e.requiresFlag && !s.flags[e.requiresFlag]) && !(e.once && s.seenOnce.includes(e.id))
  );
  const idx = filtered.findIndex((e) => e.id === "fortune-laoyuan");
  let calls = 0;
  const rng = () => {
    calls++;
    if (calls === 1) return 0.99;                          // 不啟動支線
    if (calls === 2) return (idx + 0.5) / filtered.length; // 抽老猿
    return 0.999;                                          // 判定失敗
  };
  startNextEvent(s, data, rng);
  resolveEvent(s, data, () => 0.999, null);
  assert.equal(s.exp.soft, 0);
});

test("一次性事件不重複出現", () => {
  const s = newState();
  s.seenOnce.push("choice-qigai", "choice-qiandai", "choice-laoyu", "duel-mengmian");
  const seen = new Set();
  addSteps(s, 50000);
  for (let i = 0; i < 50; i++) {
    // 第一次呼叫(支線判定)回 0.99,第二次(抽池)掃過整個池子
    let calls = 0;
    const rng = () => (calls++ === 0 ? 0.99 : i / 50);
    const ev = startNextEvent(s, data, rng);
    seen.add(ev.id);
    resolveEvent(s, data, () => 0.5, ev.type === "choice" ? 0 : null);
  }
  for (const id of ["choice-qigai", "choice-qiandai", "choice-laoyu", "duel-mengmian"]) {
    assert.ok(!seen.has(id), `${id} 不應再出現`);
  }
});

test("事件資料完整性:引用的物品與 debuff 都存在", () => {
  const itemIds = new Set(data.items.items.map((i) => i.id));
  const debuffIds = new Set(data.items.debuffs.map((d) => d.id));
  const allEvents = [...data.events.randomPool, ...data.events.quest.stages];
  for (const ev of allEvents) {
    const outcomes = [
      ev.outcome, ev.success, ev.failure,
      ...(ev.options ?? []).map((o) => o.outcome)
    ].filter(Boolean);
    for (const o of outcomes) {
      if (o.gainItem) assert.ok(itemIds.has(o.gainItem), `${ev.id} 引用未知物品 ${o.gainItem}`);
      if (o.loseItem) assert.ok(itemIds.has(o.loseItem), `${ev.id} 引用未知物品 ${o.loseItem}`);
      if (o.debuff) assert.ok(debuffIds.has(o.debuff), `${ev.id} 引用未知 debuff ${o.debuff}`);
    }
    if (ev.check) {
      for (const dim of Object.keys(ev.check.stats)) {
        assert.ok(["light", "inner", "hard", "soft", "eye", "ear"].includes(dim));
      }
    }
  }
});
