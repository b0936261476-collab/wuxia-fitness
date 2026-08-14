// 遊戲核心:狀態、練功結算、步數/事件流程(規格書 §1–§5)
// 純邏輯、無 DOM,測試可直接在 Node 執行。

import { effectiveAmount } from "./decay.js";
import { DIMENSIONS, levelFromExp } from "./exp.js";
import { successRate, weightedStatValue } from "./check.js";

export const STEPS_PER_EVENT = 1000;

export function newState() {
  const exp = {};
  for (const d of DIMENSIONS) exp[d] = 0;
  return {
    version: 1,
    exp,                       // 各維度累積有效經驗
    milestones: {},            // 已解鎖里程碑索引(永久,不隨扣分消失){dim: maxIndex}
    daily: { date: null, byExercise: {} }, // 當天各項目累積原始量(隔日歸零)
    records: [],               // 練功紀錄
    steps: { total: 0, resolved: 0, byDate: {} }, // resolved = 已觸發事件數;byDate = 各日已登記步數
    inventory: {},             // {itemId: count}
    debuffs: [],               // 目前身上的 debuff id
    flags: {},                 // 抉擇紀錄,影響後續事件
    seenOnce: [],              // 已出現過的一次性事件
    quest: { status: "none", stage: 0 },   // none | active | failed | done
    pendingEvent: null,        // 進行中、待結算的事件
    training: null,            // 計時修煉 {exerciseId, startedAt} 或 null
    journal: []                // 江湖路歷程
  };
}

// ---------- 練功 ----------

/** 記錄一筆運動,回傳 {effective, gains, coefficientSpan} */
export function logExercise(state, data, exerciseId, amount, date) {
  const ex = data.exercises.exercises.find((e) => e.id === exerciseId);
  if (!ex) throw new Error(`未知運動:${exerciseId}`);
  if (!(amount > 0)) throw new Error("數量必須大於 0");

  rolloverDaily(state, date);
  const prevCum = state.daily.byExercise[exerciseId] || 0;
  const eff = effectiveAmount(prevCum, amount, ex.tierSize, data.exercises.coefficients);

  const gains = {};
  const units = eff / ex.unitSize;
  for (const [dim, w] of Object.entries(ex.weights)) {
    gains[dim] = units * w;
  }
  addExp(state, gains, data);

  state.daily.byExercise[exerciseId] = prevCum + amount;
  state.records.push({
    date,
    exerciseId,
    name: ex.name,
    amount,
    effective: round2(eff),
    gains: mapValues(gains, round2)
  });
  return { effective: eff, gains };
}

function rolloverDaily(state, date) {
  if (state.daily.date !== date) {
    state.daily = { date, byExercise: {} };
  }
}

/** 經驗增減:懲罰不會扣到負值;里程碑一經解鎖永久保留 */
export function addExp(state, gains, data) {
  const thresholds = data.titles.milestones.thresholds;
  for (const [dim, v] of Object.entries(gains)) {
    if (!(dim in state.exp)) continue;
    state.exp[dim] = Math.max(0, state.exp[dim] + v);
    let idx = state.milestones[dim] ?? -1;
    while (idx + 1 < thresholds.length && state.exp[dim] >= thresholds[idx + 1]) idx++;
    if (idx >= 0) state.milestones[dim] = idx;
  }
}

export function levels(state) {
  const out = {};
  for (const d of DIMENSIONS) out[d] = levelFromExp(state.exp[d]);
  return out;
}

// ---------- 步數與事件 ----------

export function addSteps(state, amount) {
  if (!(amount > 0)) throw new Error("步數必須大於 0");
  state.steps.total += Math.floor(amount);
}

export const MAX_DAILY_STEPS = 30000;   // 單日採計上限(防灌步數)
export const WARN_DAILY_STEPS = 20000;  // 達此門檻標記提示

/**
 * 登記某日步數:每日一次、單日封頂(防洗分 ①)。
 * 「只能記今天或昨天」由 UI 決定傳入的 date。
 * 回傳 {applied, capped, warned};該日已記過則丟錯。
 */
export function logSteps(state, amount, date) {
  if (!(amount > 0)) throw new Error("步數必須大於 0");
  if (!state.steps.byDate) state.steps.byDate = {}; // 舊存檔相容
  if (state.steps.byDate[date] != null) throw new Error("這一天已經記過步數");
  const applied = Math.min(Math.floor(amount), MAX_DAILY_STEPS);
  state.steps.byDate[date] = applied;
  state.steps.total += applied;
  return { applied, capped: Math.floor(amount) > applied, warned: applied >= WARN_DAILY_STEPS };
}

/** 尚未觸發的事件數 */
export function pendingEventCount(state) {
  return Math.floor(state.steps.total / STEPS_PER_EVENT) - state.steps.resolved;
}

/**
 * 前行:抽出下一個事件,存入 state.pendingEvent。
 * 支線進行中 → 優先支線下一階段;否則有機率(重)啟支線;否則抽隨機池。
 */
export function startNextEvent(state, data, rng = Math.random) {
  if (state.pendingEvent) return state.pendingEvent;
  if (pendingEventCount(state) <= 0) return null;

  const ev = drawEvent(state, data, rng);
  state.steps.resolved += 1;
  state.pendingEvent = ev;
  return ev;
}

function drawEvent(state, data, rng) {
  const { quest } = data.events;
  if (state.quest.status === "active") {
    return { source: "quest", ...quest.stages[state.quest.stage] };
  }
  const canStart = state.quest.status === "none" || state.quest.status === "failed";
  if (canStart && rng() < data.events.questStartChance) {
    state.quest = { status: "active", stage: 0 };
    return { source: "quest", ...quest.stages[0] };
  }
  const pool = data.events.randomPool.filter((e) => {
    if (e.once && state.seenOnce.includes(e.id)) return false;
    if (e.requiresFlag && !state.flags[e.requiresFlag]) return false;
    if (e.forbidsFlag && state.flags[e.forbidsFlag]) return false;
    return true;
  });
  const ev = pool[Math.floor(rng() * pool.length)];
  return { source: "random", ...ev };
}

/**
 * 結算 pendingEvent。choice 事件需傳入 optionIndex。
 * 回傳寫入 journal 的紀錄。
 */
export function resolveEvent(state, data, rng = Math.random, optionIndex = null) {
  const ev = state.pendingEvent;
  if (!ev) throw new Error("沒有進行中的事件");

  const entry = {
    n: state.steps.resolved,
    id: ev.id,
    source: ev.source,
    type: ev.type,
    title: ev.title,
    text: ev.text
  };

  if (ev.type === "choice") {
    if (optionIndex == null) throw new Error("抉擇事件需要選擇");
    const opt = ev.options[optionIndex];
    entry.choice = opt.text;
    entry.resultText = opt.outcome.text;
    applyOutcome(state, data, opt.outcome);
  } else if (ev.type === "duel" || ev.type === "fortune") {
    const lv = levels(state);
    const statValue = weightedStatValue(ev.check.stats, lv);
    const modifier = debuffModifier(state, data);
    const rate = successRate(statValue, ev.check.difficulty, modifier);
    const success = rng() < rate;
    entry.rate = round2(rate);
    entry.success = success;
    const outcome = success ? ev.success : ev.failure;
    entry.resultText = outcome.text;
    if (!success && outcome.kind === "questFail" && ev.source === "quest") {
      state.quest = { status: "failed", stage: 0 };
    }
    applyOutcome(state, data, outcome);
  } else {
    // daily / clinic
    const outcome = ev.outcome;
    if (ev.type === "clinic") {
      entry.resultText = applyClinic(state, data, outcome);
    } else {
      entry.resultText = outcome.text;
      applyOutcome(state, data, outcome);
    }
  }

  if (ev.once && !state.seenOnce.includes(ev.id)) state.seenOnce.push(ev.id);

  // 支線推進:非失敗即進入下一階段;走完即完成
  if (ev.source === "quest" && state.quest.status === "active") {
    if (entry.success !== false || ev.failure?.kind !== "questFail") {
      state.quest.stage += 1;
      if (state.quest.stage >= data.events.quest.stages.length) {
        state.quest = { status: "done", stage: 0 };
        entry.questDone = true;
      }
    }
  }

  state.pendingEvent = null;
  state.journal.push(entry);
  return entry;
}

function debuffModifier(state, data) {
  let mod = 0;
  for (const id of state.debuffs) {
    const d = data.items.debuffs.find((x) => x.id === id);
    if (d) mod += d.successMod;
  }
  return mod;
}

function applyOutcome(state, data, outcome) {
  if (!outcome) return;
  if (outcome.exp) addExp(state, outcome.exp, data);
  if (outcome.flag) state.flags[outcome.flag] = true;
  if (outcome.gainItem) gainItem(state, data, outcome.gainItem);
  if (outcome.loseItem) {
    if (state.inventory[outcome.loseItem] > 0) {
      state.inventory[outcome.loseItem] -= 1;
      if (state.inventory[outcome.loseItem] === 0) delete state.inventory[outcome.loseItem];
    }
  }
  if (outcome.debuff && !state.debuffs.includes(outcome.debuff)) {
    state.debuffs.push(outcome.debuff);
  }
}

function applyClinic(state, data, outcome) {
  const had = state.debuffs.length > 0;
  if (!had) return outcome.textHealthy;
  if (outcome.cureAll) {
    state.debuffs = [];
  } else if (outcome.cureOne) {
    state.debuffs.shift();
  }
  return outcome.textCured;
}

export function gainItem(state, data, itemId) {
  const item = data.items.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`未知物品:${itemId}`);
  state.inventory[itemId] = (state.inventory[itemId] || 0) + 1;
  if (item.expOnGain) addExp(state, item.expOnGain, data); // 秘笈:入手即永久加成
  if (item.flagOnGain) state.flags[item.flagOnGain] = true;
}

/** 使用消耗品(療傷藥等)。回傳解除的 debuff id,或 null(無可解除則不消耗) */
export function useItem(state, data, itemId) {
  const item = data.items.items.find((i) => i.id === itemId);
  if (!item || item.type !== "consumable") return null;
  if (!(state.inventory[itemId] > 0)) return null;
  const target = state.debuffs.find((d) => item.cures.includes(d));
  if (!target) return null;
  state.debuffs = state.debuffs.filter((d) => d !== target);
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] === 0) delete state.inventory[itemId];
  return target;
}

// ---------- 小工具 ----------

function round2(v) {
  return Math.round(v * 100) / 100;
}

function mapValues(obj, fn) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = fn(v);
  return out;
}
