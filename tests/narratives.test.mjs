// 敘事接線驗收(§4 狀態四段式 / §8.7 監使頒號 / §4 離線恢復)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  collectNarratives, collectStateNarratives, collectBestowNarratives,
  primeNarrativeState, newNarrativeRecord
} from "../src/engine/narratives.js";
import {
  newState, createCharacter, resourceMax, resourcePercents,
  catchUpRecovery, addExp
} from "../src/engine/game.js";
import { thresholdForLevel, DIMENSIONS } from "../src/engine/exp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  titles: loadJson("data/titles.json"),
  quiz: loadJson("data/quiz.json"),
  narratives: loadJson("data/narratives.json")
};

/** 造一個已創角、資源全滿的角色 */
function freshHero() {
  const state = newState();
  const answers = data.quiz.questions.map((q) => ({
    questionId: q.id, optionId: q.options[0].id
  }));
  createCharacter(state, answers, data, () => 0.5);
  return state;
}

function setPercent(state, key, pct) {
  state.resources[key] = resourceMax(state)[key] * pct;
}

// ---------- 狀態敘事:惡化才播 ----------

test("血量掉破 30% → 播【輕傷】,四段俱全", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.25);
  const out = collectStateNarratives(state, data, resourcePercents(state));
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "hp_light");
  assert.equal(out[0].name, "輕傷");
  assert.equal(out[0].beats.filter(Boolean).length, 4);
});

test("停在同一檔位不會重播", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.25);
  assert.equal(collectStateNarratives(state, data, resourcePercents(state)).length, 1);
  setPercent(state, "hp", 0.20);
  assert.equal(collectStateNarratives(state, data, resourcePercents(state)).length, 0);
});

test("輕傷再惡化成重傷 → 補播【重傷】", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.25);
  collectStateNarratives(state, data, resourcePercents(state));
  setPercent(state, "hp", 0.05);
  const out = collectStateNarratives(state, data, resourcePercents(state));
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "hp_heavy");
});

test("養好又掉下來 → 會再播一次(檔位有記回去)", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.25);
  collectStateNarratives(state, data, resourcePercents(state));
  setPercent(state, "hp", 1.0);
  assert.equal(collectStateNarratives(state, data, resourcePercents(state)).length, 0); // 好轉靜默
  setPercent(state, "hp", 0.25);
  assert.equal(collectStateNarratives(state, data, resourcePercents(state)).length, 1);
});

test("三條線同時掉破門檻 → 三段一起排隊", () => {
  const state = freshHero();
  for (const k of ["hp", "qi", "tili"]) setPercent(state, k, 0.2);
  const out = collectStateNarratives(state, data, resourcePercents(state));
  assert.deepEqual(out.map((o) => o.key), ["hp_light", "qi_light", "tili_light"]);
});

test("創角前沒有資源 → 不播也不炸", () => {
  const state = newState();
  assert.deepEqual(collectStateNarratives(state, data, resourcePercents(state)), []);
});

// ---------- 監使頒號:每維終身一次 ----------

test("某一維首次到 Lv.10 → 播該維頒號,稱號與 titles.json 對得上", () => {
  const state = freshHero();
  addExp(state, { eye: thresholdForLevel(10) }, data);
  const out = collectBestowNarratives(state, data);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "eye");
  assert.equal(out[0].name, data.titles.milestones.titles.eye[0]);
  assert.equal(out[0].beats.filter(Boolean).length, 4);
});

test("頒號不重播:再升到 Lv.20 也不會再來一次", () => {
  const state = freshHero();
  addExp(state, { eye: thresholdForLevel(10) }, data);
  collectBestowNarratives(state, data);
  addExp(state, { eye: thresholdForLevel(20) - thresholdForLevel(10) }, data);
  assert.equal(collectBestowNarratives(state, data).length, 0);
});

test("Lv.9 不觸發", () => {
  const state = freshHero();
  addExp(state, { eye: thresholdForLevel(9) }, data);
  assert.equal(collectBestowNarratives(state, data).length, 0);
});

test("六維都到 Lv.10 → 六段各一,順序照 DIMENSIONS", () => {
  const state = freshHero();
  const gains = {};
  for (const d of DIMENSIONS) gains[d] = thresholdForLevel(10);
  addExp(state, gains, data);
  const out = collectBestowNarratives(state, data);
  assert.deepEqual(out.map((o) => o.key), DIMENSIONS);
});

test("collectNarratives:頒號排在狀態前面", () => {
  const state = freshHero();
  addExp(state, { ear: thresholdForLevel(10) }, data);
  setPercent(state, "hp", 0.2);
  const out = collectNarratives(state, data, resourcePercents(state));
  assert.deepEqual(out.map((o) => o.kind), ["bestow", "state"]);
});

// ---------- 舊存檔遷移:不倒帶 ----------

test("primeNarrativeState:早就重傷、早就過 Lv.10 的舊存檔載入時不補播", () => {
  const state = freshHero();
  addExp(state, { eye: thresholdForLevel(10) }, data);
  setPercent(state, "hp", 0.05);
  state.narrative = null;                       // 模擬沒有這個欄位的舊存檔
  primeNarrativeState(state, resourcePercents(state));
  assert.deepEqual(collectNarratives(state, data, resourcePercents(state)), []);
});

test("newNarrativeRecord:新角色三條線都從「無狀態」起算", () => {
  assert.deepEqual(newNarrativeRecord(), { states: { hp: null, qi: null, tili: null }, bestow: {} });
});

// ---------- 離線恢復 ----------

test("catchUpRecovery:第一次呼叫只對時,不憑空回血", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.5);
  const before = state.resources.hp;
  assert.equal(catchUpRecovery(state, 1_000_000, "2026-08-21"), 0);
  assert.equal(state.resources.hp, before);
  assert.equal(state.lastTickAt, 1_000_000);
});

test("catchUpRecovery:離線一小時,血量依 §4.1 每小時 20% 上限回復", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.5);
  const max = resourceMax(state).hp;
  catchUpRecovery(state, 0, "2026-08-21");
  catchUpRecovery(state, 3600_000, "2026-08-21");
  assert.ok(Math.abs(state.resources.hp - (max * 0.5 + max * 0.20)) < 1e-6);
});

test("catchUpRecovery:回復不會超過上限", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.9);
  catchUpRecovery(state, 0, "2026-08-21");
  catchUpRecovery(state, 3600_000 * 240, "2026-08-21");
  assert.ok(state.resources.hp <= resourceMax(state).hp + 1e-9);
});

test("catchUpRecovery:時鐘被往回調不倒扣", () => {
  const state = freshHero();
  setPercent(state, "hp", 0.5);
  catchUpRecovery(state, 3600_000, "2026-08-21");
  const before = state.resources.hp;
  assert.equal(catchUpRecovery(state, 0, "2026-08-21"), 0);
  assert.equal(state.resources.hp, before);
  assert.equal(state.lastTickAt, 3600_000);
});

test("catchUpRecovery:創角前沒有資源 → 不動作", () => {
  const state = newState();
  assert.equal(catchUpRecovery(state, 1000, "2026-08-21"), 0);
});
