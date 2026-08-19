import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  hpMax, qiMax, tiliMax, allMax, applyDamage, recover,
  hpDebuffEffects, qiDebuffEffects, tiliDebuffEffects,
  isDead, isQiExhausted, isTiliExhausted,
  DAMAGE_TIERS, TILI_COST_PER_EVENT
} from "../src/engine/resources.js";
import {
  newState, createCharacter, resourceMax, resourcePercents,
  damageResource, tickResourceRecovery, logExercise,
  addSteps, startNextEvent, resolveEvent
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

// ---------- 上限公式(§4.1–4.3) ----------

test("hpMax:基準值50根骨、六維總和0 → 500+50*100*(1+0)=5500", () => {
  assert.ok(Math.abs(hpMax(50, 0) - 5500) < 1e-9);
});

test("hpMax:六維總和提升會推高上限(√遞減)", () => {
  const base = hpMax(50, 0);
  const withLevels = hpMax(50, 100); // sqrt(100)=10
  assert.ok(Math.abs(withLevels - (500 + 50 * 100 * (1 + 0.02 * 10))) < 1e-9);
  assert.ok(withLevels > base);
});

test("qiMax:基準值50根骨、內功0級 → 500+50*200*(1+0)=10500", () => {
  assert.ok(Math.abs(qiMax(50, 0) - 10500) < 1e-9);
});

test("tiliMax:線性,不含√遞減 → 1000+50*10+levelSum*25", () => {
  assert.ok(Math.abs(tiliMax(50, 0) - 1500) < 1e-9);
  assert.ok(Math.abs(tiliMax(50, 10) - 1750) < 1e-9); // +10*25
});

test("allMax:根骨1極端命格,六維全0仍可玩(基礎常數兜底,§11衝突B決議)", () => {
  const max = allMax(1, { light: 0, inner: 0, hard: 0, soft: 0, eye: 0, ear: 0 });
  assert.ok(max.hp > 0 && max.qi > 0 && max.tili > 0);
  assert.ok(Math.abs(max.hp - 600) < 1e-9);   // 500+1*100
  assert.ok(Math.abs(max.qi - 700) < 1e-9);   // 500+1*200
  assert.ok(Math.abs(max.tili - 1010) < 1e-9); // 1000+1*10
});

// ---------- 傷害/恢復(絕對值/百分比,§4總則) ----------

test("applyDamage:絕對值扣減,不會扣到負值", () => {
  assert.equal(applyDamage(100, 150), 0);
  assert.equal(applyDamage(500, 150), 350);
});

test("recover:百分比×上限×時數,不超過上限", () => {
  const v = recover(1000, 5000, 0.2, 1); // 5000*0.2*1=1000
  assert.equal(v, 2000);
  assert.equal(recover(4900, 5000, 0.2, 1), 5000); // 封頂
});

test("recover:倍率參數(體力當日運動×1.5)", () => {
  const v = recover(0, 1000, 0.2, 1, 1.5); // 1000*0.2*1*1.5=300
  assert.equal(v, 300);
});

test("傷害檔位常數:輕150/中500/重1200(§4.1)", () => {
  assert.deepEqual(DAMAGE_TIERS, { light: 150, medium: 500, heavy: 1200 });
});

// ---------- DEBUFF 分級(§4:嚴格「低於」) ----------

test("hpDebuffEffects:30%整不觸發(嚴格<),29.9%觸發輕傷", () => {
  assert.equal(hpDebuffEffects(0.30).tier, null);
  assert.equal(hpDebuffEffects(0.299).tier, "light");
});

test("hpDebuffEffects:10%整不算重傷,9.9%才算(嚴格<)", () => {
  assert.equal(hpDebuffEffects(0.10).tier, "light");
  assert.equal(hpDebuffEffects(0.099).tier, "heavy");
});

test("hpDebuffEffects:輕傷六維×0.7、判定失敗率+10%(=成功率-0.1)", () => {
  const e = hpDebuffEffects(0.2);
  assert.equal(e.sixdimMultiplier, 0.7);
  assert.equal(e.hpRelSuccessMod, -0.1);
});

test("hpDebuffEffects:重傷六維×0.5、判定失敗率+50%", () => {
  const e = hpDebuffEffects(0.05);
  assert.equal(e.sixdimMultiplier, 0.5);
  assert.equal(e.hpRelSuccessMod, -0.5);
});

test("qiDebuffEffects:輕/重分別-20%/-40%(§4.2)", () => {
  assert.equal(qiDebuffEffects(0.2).qiRelSuccessMod, -0.2);
  assert.equal(qiDebuffEffects(0.05).qiRelSuccessMod, -0.4);
});

test("tiliDebuffEffects:輕/重分別-20%/-50%(§4.3)", () => {
  assert.equal(tiliDebuffEffects(0.2).tiliRelSuccessMod, -0.2);
  assert.equal(tiliDebuffEffects(0.05).tiliRelSuccessMod, -0.5);
});

test("正常區間(≥30%)三資源皆無DEBUFF", () => {
  assert.equal(hpDebuffEffects(0.5).tier, null);
  assert.equal(qiDebuffEffects(0.5).tier, null);
  assert.equal(tiliDebuffEffects(0.5).tier, null);
});

// ---------- 歸零判定 ----------

test("isDead/isQiExhausted/isTiliExhausted:歸零(0)才算", () => {
  assert.equal(isDead(0), true);
  assert.equal(isDead(1), false);
  assert.equal(isQiExhausted(0), true);
  assert.equal(isTiliExhausted(0), true);
});

// ---------- game.js 整合 ----------

test("createCharacter:三資源以創角當下的上限滿值初始化", () => {
  const s = newState();
  assert.equal(s.resources, null);
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  assert.ok(s.resources);
  const max = resourceMax(s);
  assert.equal(s.resources.hp, max.hp);
  assert.equal(s.resources.qi, max.qi);
  assert.equal(s.resources.tili, max.tili);
});

test("resourcePercents:創角前回 null,創角後回 1(滿值)", () => {
  const s = newState();
  assert.equal(resourcePercents(s), null);
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  const p = resourcePercents(s);
  assert.ok(Math.abs(p.hp - 1) < 1e-9);
  assert.ok(Math.abs(p.qi - 1) < 1e-9);
  assert.ok(Math.abs(p.tili - 1) < 1e-9);
});

test("damageResource:扣血後百分比正確反映,不影響上限", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  const max = resourceMax(s);
  damageResource(s, "hp", 1000);
  assert.equal(s.resources.hp, max.hp - 1000);
});

test("tickResourceRecovery:自然恢復隨時數增加,體力當日有運動則×1.5", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  damageResource(s, "hp", 3000);
  damageResource(s, "tili", 900);
  const before = { ...s.resources };
  tickResourceRecovery(s, 1, "2026-01-01"); // 沒運動紀錄
  assert.ok(s.resources.hp > before.hp);
  const tiliNoExercise = s.resources.tili;

  const s2 = newState();
  createCharacter(s2, [{ questionId: "q03", optionId: "a" }], data);
  damageResource(s2, "tili", 900);
  logExercise(s2, data, "paobu", 20, "2026-01-01"); // 當天有運動
  tickResourceRecovery(s2, 1, "2026-01-01");
  assert.ok(s2.resources.tili > tiliNoExercise); // 有運動恢復更多(×1.5)
});

test("resolveEvent:每次事件固定扣體力100點(§4.3/§6.1)", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  const before = s.resources.tili;
  addSteps(s, 1000);
  startNextEvent(s, data, () => 0.99); // 抽日常事件,避開支線
  resolveEvent(s, data, () => 0.5, null);
  assert.equal(s.resources.tili, before - TILI_COST_PER_EVENT);
});

test("resolveEvent:創角前(無資源)事件仍可正常結算,不報錯", () => {
  const s = newState();
  assert.equal(s.resources, null);
  addSteps(s, 1000);
  startNextEvent(s, data, () => 0.99);
  const entry = resolveEvent(s, data, () => 0.5, null);
  assert.ok(entry);
  assert.equal(s.resources, null); // 仍維持 null,沒有意外寫入
});

test("resolveEvent:血量重傷時,六維乘數會拉低判定用等級,成功率不會頂到封頂", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  s.exp.hard = 5000; // 練到很高等級,原本足以讓 duel-zuihan(benchmarkLevel 1)輕鬆封頂95%
  damageResource(s, "hp", s.resources.hp * 0.95); // 打到剩5% → 重傷

  addSteps(s, 1000);
  const filtered = data.events.randomPool.filter(
    (e) => !(e.requiresFlag && !s.flags[e.requiresFlag]) && !(e.once && s.seenOnce.includes(e.id))
  );
  const idx = filtered.findIndex((e) => e.id === "duel-zuihan");
  const drawRng = (() => {
    let calls = 0;
    return () => (calls++ === 0 ? 0.99 : (idx + 0.5) / filtered.length);
  })();
  startNextEvent(s, data, drawRng);
  const entry = resolveEvent(s, data, () => 0.99, null);
  assert.ok(entry.rate < 0.95); // 重傷六維×0.5後,不會頂到封頂
});
