// 遊戲核心:狀態、練功結算、步數/事件流程(規格書 §1–§5)
// 純邏輯、無 DOM,測試可直接在 Node 執行。

import { effectiveAmount } from "./decay.js";
import { DIMENSIONS, levelFromExp } from "./exp.js";
import { weightedStatValue } from "./check.js";
import { successRateV2 } from "./tags.js";
import { generateTalents, wuxingMultiplier, openingFateLine } from "./talent.js";
import {
  allMax, applyDamage, recover, RECOVERY_RATE, TILI_EXERCISE_RECOVERY_MULTIPLIER,
  TILI_COST_PER_EVENT, hpDebuffEffects, qiDebuffEffects, tiliDebuffEffects,
  HP_DEBUFF_TABLE, QI_DEBUFF_TABLE, TILI_DEBUFF_TABLE, isDead
} from "./resources.js";
import {
  newTrialProgress, recordTrialProgress, isTrialComplete,
  recoveredAttemptLevel, attemptBreakthrough
} from "./rebirth.js";
import { titleTiers, balancedTier, equippedTitle } from "./titles.js";
import { playerRankSnapshot, integerMilestonesCrossed, surpassedNpcs, surpassFameReward } from "./npcs.js";
import { newReputation, addFame } from "./reputation.js";

export const STEPS_PER_EVENT = 1000;

export function newState() {
  const exp = {};
  for (const d of DIMENSIONS) exp[d] = 0;
  return {
    version: 1,
    talents: null,             // 創角後寫入 {genggu, wuxing, yunqi, ...};創角前為 null,一經生成永不重抽(§1.1)
    resources: null,           // 創角後寫入 {hp, qi, tili}(當前絕對值,§4);上限依 talents+等級即時計算,不快取
    rebirth: null,             // 血量歸零後寫入 {progress:{...}}(§5.1);完成六大試煉前無法觸發新事件
    rebirthCount: 0,           // 已重生次數(§5.2 方案B機率遞減用)
    lastRebirthDate: null,     // 上次重生完成日期,用於「每30天回復一級」
    exp,                       // 各維度累積有效經驗
    milestones: {},            // 已解鎖里程碑索引(永久,不隨扣分消失){dim: maxIndex}
    balancedMilestone: -1,     // 已解鎖均衡里程碑索引(§8.3,永久,-1=尚未解鎖)
    reputation: newReputation(), // 俠名/惡名雙軌(§9.6),不依賴創角,從第一步就可累積
    lastKnownRank: null,       // 上次快照的群俠錄排名(§9.7/§9.9,用於偵測跨越整數關口/超越NPC)
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

// ---------- 創角(§1) ----------

/**
 * 心理測驗創角:僅能呼叫一次,生成後永久寫入 state.talents,無重抽(§1.1)。
 * 同時抽一句開局命格文案(§1.3)寫進 journal——只存 category/axis/line,
 * 不存天賦數值本身,維持「天賦數值全程不出現在任何 UI」的鐵律。
 * @param {Array<{questionId:string, optionId:string}>} answers
 * @param {object} data  需含 data.quiz(data/quiz.json)
 * @param {Function} rng
 * @returns {{talents:object, fate:{category:string, axis?:string, line:string}}}
 */
export function createCharacter(state, answers, data, rng = Math.random) {
  if (state.talents) throw new Error("已完成創角,天賦不可重抽");
  state.talents = generateTalents(answers, data.quiz);
  const max = allMax(state.talents.genggu, levels(state)); // 創角當下六維皆為0級,純看根骨
  state.resources = { hp: max.hp, qi: max.qi, tili: max.tili };
  const fate = openingFateLine(state.talents, data.quiz, rng);
  state.journal.push({ n: 0, type: "fate", category: fate.category, axis: fate.axis, text: fate.line });
  return { talents: state.talents, fate };
}

/** 三資源目前上限(依當前天賦+六維等級即時計算,不快取,避免升級後失準) */
export function resourceMax(state) {
  const genggu = state.talents?.genggu ?? 50; // 創角前用基準值,行為與其他系統一致
  return allMax(genggu, levels(state));
}

/** 三資源目前百分比;創角前(state.resources 為 null)回 null */
export function resourcePercents(state) {
  if (!state.resources) return null;
  const max = resourceMax(state);
  return {
    hp: state.resources.hp / max.hp,
    qi: state.resources.qi / max.qi,
    tili: state.resources.tili / max.tili
  };
}

/** 扣資源(絕對值,§4總則),floor在0,不做上限鉗制(傷害不會超過上限) */
export function damageResource(state, key, amount) {
  state.resources[key] = applyDamage(state.resources[key], amount);
  return state.resources[key];
}

/**
 * 時間流逝的自然恢復(§4.1/4.2/4.3):百分比×上限×時數。
 * 體力當日有運動紀錄(state.daily.date 是今天且有練功)恢復速度×1.5(§4.3)。
 * @param {number} hours
 * @param {string} today  今天日期字串,用來判斷「當日是否有運動」
 */
export function tickResourceRecovery(state, hours, today) {
  if (!state.resources) return;
  const max = resourceMax(state);
  const exercisedToday = state.daily.date === today && Object.keys(state.daily.byExercise).length > 0;
  state.resources.hp = recover(state.resources.hp, max.hp, RECOVERY_RATE.hp, hours);
  state.resources.qi = recover(state.resources.qi, max.qi, RECOVERY_RATE.qi, hours);
  state.resources.tili = recover(
    state.resources.tili, max.tili, RECOVERY_RATE.tili, hours,
    exercisedToday ? TILI_EXERCISE_RECOVERY_MULTIPLIER : 1
  );
}

// ---------- 重生(§5.1/§5.2) ----------

function daysBetween(dateA, dateB) {
  const a = Date.parse(dateA + "T00:00:00Z");
  const b = Date.parse(dateB + "T00:00:00Z");
  return Math.floor((b - a) / 86400000);
}

/**
 * 檢查重生試煉是否已達標;若達標則恢復三資源滿值、進行根骨突破判定(§5.2方案B),
 * 並清空 state.rebirth。未達標或根本不在重生中則回 null。
 * @param {string} today  今天日期字串(YYYY-MM-DD),用於§5.2「每30天回復一級」
 * @param {Function} rng
 * @returns {{success:boolean, amount:number, probability:number, attemptLevel:number}|null}
 */
export function attemptRebirthCompletion(state, today, rng = Math.random) {
  if (!state.rebirth) return null;
  if (!isTrialComplete(state.rebirth.progress)) return null;

  state.rebirthCount += 1;
  const daysSince = state.lastRebirthDate != null ? daysBetween(state.lastRebirthDate, today) : Number.MAX_SAFE_INTEGER;
  const attemptLevel = recoveredAttemptLevel(state.rebirthCount, daysSince);
  const result = attemptBreakthrough(attemptLevel, rng);
  if (result.success) state.talents.genggu += result.amount; // 根骨突破成功(§1.5增幅表),先突破再算恢復上限

  const max = resourceMax(state);
  state.resources = { hp: max.hp, qi: max.qi, tili: max.tili }; // 完成六大試煉 → 恢復(§5.1),反映突破後的新上限

  state.lastRebirthDate = today;
  state.rebirth = null;
  return { ...result, attemptLevel };
}

// ---------- 群俠錄排名與排位互動(§9.7/§9.9) ----------

function levelSum(state) {
  return Object.values(levels(state)).reduce((a, b) => a + b, 0);
}

/**
 * 更新排名快照;若名次提升,偵測本次跨越的整數關口(§9.9萬人區)與超越的具名NPC(§9.9),
 * 超越NPC首次觸發時發俠名獎勵並記flag(供敘事引用)。
 * 需要 data.npcs(data/npcs.json);data.npcs 不存在時直接跳過(維持向後相容,不報錯)。
 */
export function updateRanking(state, data) {
  if (!data.npcs) return null;
  const snapshot = playerRankSnapshot(levelSum(state), data.npcs);
  const prevRank = state.lastKnownRank ?? snapshot.rank; // 首次呼叫視為無跨越
  const milestonesCrossed = integerMilestonesCrossed(prevRank, snapshot.rank);
  const surpassed = surpassedNpcs(prevRank, snapshot.rank, data.npcs);
  const newlySurpassed = [];
  for (const npc of surpassed) {
    const flagKey = `surpassed_${npc.rank}`;
    if (!state.flags[flagKey]) {
      state.flags[flagKey] = true;
      addFame(state.reputation, surpassFameReward(npc.rank), `超越${npc.name}`);
      newlySurpassed.push(npc);
    }
  }
  state.lastKnownRank = snapshot.rank;
  return { ...snapshot, milestonesCrossed, surpassed: newlySurpassed };
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
  const wuxingMod = wuxingMultiplier(state.talents?.wuxing ?? 50); // 創角前按基準值50計(倍率=1,不影響行為)
  for (const [dim, w] of Object.entries(ex.weights)) {
    gains[dim] = units * w * wuxingMod;
  }
  addExp(state, gains, data);

  // §5.1 重生中:原始申報量(非扣過遞減的有效值)同時累積進六大試煉進度
  if (state.rebirth) recordTrialProgress(state.rebirth.progress, exerciseId, amount);

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
  const thresholds = data.titles.milestones.thresholds; // §8.2:等級門檻(非經驗值!)
  for (const [dim, v] of Object.entries(gains)) {
    if (!(dim in state.exp)) continue;
    state.exp[dim] = Math.max(0, state.exp[dim] + v);
    const level = levelFromExp(state.exp[dim]);
    let idx = state.milestones[dim] ?? -1;
    while (idx + 1 < thresholds.length && level >= thresholds[idx + 1]) idx++;
    if (idx >= 0) state.milestones[dim] = idx;
  }

  // 均衡里程碑(§8.3):六維等級總和達門檻,永久保留
  const balancedThresholds = data.titles.balanced.thresholds;
  const levelSum = Object.values(levels(state)).reduce((a, b) => a + b, 0);
  let bIdx = state.balancedMilestone ?? -1;
  while (bIdx + 1 < balancedThresholds.length && levelSum >= balancedThresholds[bIdx + 1]) bIdx++;
  if (bIdx >= 0) state.balancedMilestone = bIdx;
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
  if (state.rebirth) return null; // §5.1:重生中無法觸發新事件,得先完成六大試煉
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

  // §4.3/§6.1:每次事件固定消耗體力100點(創角前無資源可扣,略過)。
  // TODO(M5):體力耗竭(【筋疲力竭】)應阻止觸發新事件、只能走休息事件,此處先只扣值不擋流程。
  if (state.resources) damageResource(state, "tili", TILI_COST_PER_EVENT);

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
    let relevantLevel = weightedStatValue(ev.check.stats, lv);

    const percents = resourcePercents(state); // null 直到創角完成
    if (percents) {
      // §4.1 血量 DEBUFF 的「六維-X%」是額外的整體乘數,不是標籤修正,直接乘進相關等級。
      relevantLevel *= hpDebuffEffects(percents.hp).sixdimMultiplier;
    }

    // TODO(M4殘留):舊版 debuff(跌打損傷/氣息紊亂)仍是固定扣減,尚未併入三資源;
    // 等這批舊 debuff 內容改走資源DoT(§4.4)後可移除這行與 debuffModifier()。
    const legacyModifier = debuffModifier(state, data);

    const checkStatsDims = Object.keys(ev.check.stats || {});
    const titleTagList = [...checkStatsDims.map((d) => `title_${d}`), "title_balanced"];

    const baseRate = successRateV2({
      relevantLevel,
      benchmarkLevel: ev.check.benchmarkLevel,
      tagList: [...(ev.check.tags || []), ...titleTagList], // 天賦/資源標籤(§6.4)+稱號輕加成(§8.4)
      ctx: {
        talents: state.talents ?? undefined,
        eventCategory: ev.eventCategory,
        resourcePercents: percents ?? undefined,
        debuffTables: percents
          ? { hp: HP_DEBUFF_TABLE, qi: QI_DEBUFF_TABLE, tili: TILI_DEBUFF_TABLE }
          : undefined,
        titleTiers: titleTiers(state),
        balancedTier: balancedTier(state)
      },
      tagsData: data.tags
    });
    const rate = Math.min(0.95, Math.max(0.05, baseRate + legacyModifier));
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

  entry.equippedTitle = equippedTitle(state, data, ev.check?.stats).title;
  entry.ranking = updateRanking(state, data);

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
  // §4.4:事件失敗一律直接扣資源(絕對值,依§4.1傷害檔位),取代舊版debuff/exp懲罰
  if (outcome.damage && state.resources) {
    for (const [key, amount] of Object.entries(outcome.damage)) {
      damageResource(state, key, amount);
    }
    if (isDead(state.resources.hp) && !state.rebirth) {
      state.rebirth = { progress: newTrialProgress() };
    }
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
