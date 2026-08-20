// 遊戲核心:狀態、練功結算、步數/事件流程(規格書 §1–§5)
// 純邏輯、無 DOM,測試可直接在 Node 執行。

import { effectiveAmount } from "./decay.js";
import { DIMENSIONS, levelFromExp } from "./exp.js";
import { generateTalents, wuxingMultiplier, openingFateLine } from "./talent.js";
import { startEventV2, presentEventV2, chooseOptionV2, chooseSubV2, laborOnExercise } from "./events2.js";
import {
  allMax, applyDamage, recover, RECOVERY_RATE, TILI_EXERCISE_RECOVERY_MULTIPLIER
} from "./resources.js";
import { newNarrativeRecord } from "./narratives.js";
import {
  newTrialProgress, recordTrialProgress, isTrialComplete,
  recoveredAttemptLevel, attemptBreakthrough
} from "./rebirth.js";
import { equippedTitle } from "./titles.js";
import {
  playerRankSnapshot, integerMilestonesCrossed, surpassedNpcs, surpassFameReward, revealsRanking
} from "./npcs.js";
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
    lastKnownRank: null,       // 上次「得知」的群俠錄名次(§9.7/§9.9);沒看過榜文就是 null
    rankSeen: null,            // 上次得知名次的時機 {date, source:"榜文"|"監使"},供 UI 說明數字有多舊
    daily: { date: null, byExercise: {}, exp: 0, weightSteps: 0, actionSteps: 0 }, // 當天各項目累積原始量、有效經驗、行動力折算(隔日歸零)
    records: [],               // 練功紀錄
    steps: { total: 0, resolved: 0, byDate: {}, fromWalking: 0, fromExercise: 0 }, // resolved = 已觸發事件數;byDate = 各日已登記步數;兩個 from* 是行動力來源分帳
    inventory: {},             // {itemId: count}
    debuffs: [],               // 目前身上的 debuff id(M4殘留,§4.4 後不再有事件發放)
    flags: {},                 // 抉擇紀錄(Flag 三命運 §6.6),影響後續事件
    flagDates: {},             // 各 flag 落地日期(minDaysSince 樓梯階距用)
    labor: null,               // 勞務折銀狀態(§9.11.4){active, startDate, dayPoints, fullDates, lastExerciseDate}
    pendingEvent: null,        // 進行中、待結算的事件(events2.js 生命週期)
    training: null,            // 計時修煉 {exerciseId, startedAt} 或 null
    narrative: newNarrativeRecord(), // 敘事播放紀錄(§4 狀態四段式 / §8.7 監使頒號),避免重播
    lastTickAt: null,          // 上次結算自然恢復的時戳(ms);離線期間的恢復靠它補算
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

/**
 * 補算離線期間的自然恢復。UI 只要在載入與定時器裡呼叫這一支,
 * 三資源就會隨真實時間回血,不再是只降不升的單行道。
 * @param {number} nowMs  現在時戳(Date.now())
 * @param {string} today  今天日期字串(判斷「當日是否有運動」的體力加成)
 * @returns {number} 這次補算了幾小時
 */
export function catchUpRecovery(state, nowMs, today) {
  if (!state.resources) return 0;
  if (state.lastTickAt == null) { state.lastTickAt = nowMs; return 0; }
  const hours = (nowMs - state.lastTickAt) / 3600000;
  if (!(hours > 0)) return 0;          // 時鐘被往回調就原地不動,不倒扣
  tickResourceRecovery(state, hours, today);
  state.lastTickAt = nowMs;
  return hours;
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

/** 六維等級總和,群俠錄名次就是拿這個數字去萬人總冊裡比(§9.7.1) */
export function playerLevelSum(state) {
  return levelSum(state);
}

/**
 * 得知名次(§9.7/§9.9)。
 *
 * 設計者定調(2026-08-21):名次不是隨時可查的資料——玩家得在城裡看到榜文、
 * 或遇上司天監的人,才會知道自己排第幾。這一支就是「那一刻」:它把真實名次
 * 寫進 state.lastKnownRank,並結算從上次得知到現在跨越的整數關口與超越的具名 NPC。
 *
 * 俠名也在這一刻才入帳,而不是在超越發生的當下——這正是 §9.6.1 的見證原則:
 * 聲望只在有人知道時變動。你壓過了誰,得等榜文貼出來,江湖才算數。
 *
 * 需要 data.npcs(data/npcs.json);data.npcs 不存在時直接跳過(維持向後相容,不報錯)。
 * @param {string} [todayStr] 得知的日期
 * @param {"榜文"|"監使"} [source] 得知管道
 */
export function revealRanking(state, data, todayStr = null, source = null) {
  if (!data.npcs) return null;
  const snapshot = playerRankSnapshot(levelSum(state), data.npcs);
  const firstTime = state.lastKnownRank == null;
  const prevRank = state.lastKnownRank ?? snapshot.rank; // 第一次看榜:只是知道自己在哪,沒有「跨越」
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
  if (todayStr) state.rankSeen = { date: todayStr, source: source ?? "榜文" };
  return { ...snapshot, prevRank, firstTime, milestonesCrossed, surpassed: newlySurpassed };
}

/** 這個事件會不會讓玩家看到榜文/遇到監使;回傳得知管道或 null */
export function rankingRevealOf(entry, data) {
  const ev = data.events?.pool?.find((e) => e.eventId === entry.id);
  return revealsRanking(ev?.tagBlock);
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

  // 運動換行動力(設計者定調 2026-08-21)。以「當日」為單位重算應得總量,再補差額。
  const gainSum = Object.values(gains).reduce((a, b) => a + b, 0);
  state.daily.exp = (state.daily.exp ?? 0) + gainSum;
  state.daily.weightSteps = (state.daily.weightSteps ?? 0) + exerciseStepEquivalent(ex, eff, data);
  const entitled = dailyActionStepEntitlement(state, data);
  const actionSteps = Math.max(0, entitled - (state.daily.actionSteps ?? 0));
  if (actionSteps > 0) {
    state.daily.actionSteps = entitled;
    state.steps.total += actionSteps;
    state.steps.fromExercise = (state.steps.fromExercise ?? 0) + actionSteps;
  }

  // §9.11.4 勞務折銀:湊錢中,當日有效經驗總量計入工錢(滿日=掙一兩)
  laborOnExercise(state, data, date, Object.values(gains).reduce((a, b) => a + b, 0));

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
  return { effective: eff, gains, actionSteps };
}

/** 匯率預設值(data/exercises.json 沒填時的後備;數值以資料檔為準) */
export const DEFAULT_STEPS_PER_WEIGHT_POINT = 1.25;
export const DEFAULT_WALK_EXP_PER_STEP = 0.01;

/**
 * 一筆運動折合多少「步」的行動力(§行動力,2026-08-21 定調)。
 * @param {object} ex   運動定義(data/exercises.json 的一項)
 * @param {number} eff  遞減後的有效量
 */
export function exerciseStepEquivalent(ex, eff, data) {
  const rate = data.exercises?.actionPoints?.stepsPerWeightPoint ?? DEFAULT_STEPS_PER_WEIGHT_POINT;
  const weightSum = Object.values(ex.weights).reduce((a, b) => a + b, 0);
  return Math.round((eff / ex.unitSize) * weightSum * rate);
}

/**
 * 當日運動總共該換到多少行動力(設計者定調 2026-08-21「認真練功保底」)。
 *
 * 取兩者的較大者:
 *   ① 權重折算 —— 當日各筆 exerciseStepEquivalent 的累加
 *   ② 認真練功保底 —— floor.steps × min(1, 當日有效經驗 ÷ 門檻)
 *
 * ② 按比例給而非一刀切,是為了不出現「差一點點就完全沒有」的斷崖;
 * 而因為分子是遞減後的有效經驗,「隨便動兩下」也領不到多少。
 * 重訓、瑜珈這類六維權重天生就低的運動靠 ② 補足;本來就換得多的有氧走 ①,不受影響。
 */
export function dailyActionStepEntitlement(state, data) {
  const weightSteps = state.daily?.weightSteps ?? 0;
  const floor = data.exercises?.actionPoints?.dailyFloor;
  if (!floor?.steps || !(floor.effectiveExpThreshold > 0)) return Math.round(weightSteps);
  const ratio = Math.min(1, (state.daily?.exp ?? 0) / floor.effectiveExpThreshold);
  return Math.round(Math.max(weightSteps, floor.steps * ratio));
}

function rolloverDaily(state, date) {
  if (state.daily.date !== date) {
    state.daily = { date, byExercise: {}, exp: 0, weightSteps: 0, actionSteps: 0 };
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
export function logSteps(state, data, amount, date) {
  if (!(amount > 0)) throw new Error("步數必須大於 0");
  if (!state.steps.byDate) state.steps.byDate = {}; // 舊存檔相容
  if (state.steps.byDate[date] != null) throw new Error("這一天已經記過步數");
  const applied = Math.min(Math.floor(amount), MAX_DAILY_STEPS);
  state.steps.byDate[date] = applied;
  state.steps.total += applied;
  state.steps.fromWalking = (state.steps.fromWalking ?? 0) + applied;

  // 走路也練基本功(設計者定調 2026-08-21):每一步六維各 +0.01。
  // 算的是採計後的步數,超過單日上限的部分不給經驗也不給行動力。
  const perStep = data?.exercises?.walking?.expPerStepPerDimension ?? DEFAULT_WALK_EXP_PER_STEP;
  const perDim = applied * perStep;
  let gains = null;
  if (perDim > 0 && data?.titles) {
    gains = {};
    for (const d of DIMENSIONS) gains[d] = perDim;
    addExp(state, gains, data);
  }

  return {
    applied,
    capped: Math.floor(amount) > applied,
    warned: applied >= WARN_DAILY_STEPS,
    gains
  };
}

/** 尚未觸發的事件數 */
export function pendingEventCount(state) {
  return Math.floor(state.steps.total / STEPS_PER_EVENT) - state.steps.resolved;
}

/**
 * 前行:抽出下一個事件(events2.js v2 生命週期),存入 state.pendingEvent。
 * 勞務結算(§9.11.4)優先插隊;其餘依 conditions/cooldown/weightFlags 抽池。
 * @param {string} todayStr 今天日期(YYYY-MM-DD),樓梯階距與勞務期限都靠它
 */
export function startNextEvent(state, data, todayStr, rng = Math.random) {
  if (state.pendingEvent) return state.pendingEvent;
  if (state.rebirth) return null; // §5.1:重生中無法觸發新事件,得先完成六大試煉
  if (pendingEventCount(state) <= 0) return null;

  const ev = startEventV2(state, data, todayStr, rng);
  if (!ev) return null; // 池子全在冷卻/條件不符:不消耗步數,明日再來
  state.steps.resolved += 1;
  return ev;
}

/** 呈現用視圖(UI 渲染入口) */
export function presentEvent(state, data) {
  return presentEventV2(state, data);
}

function finalizeHooks(state, data) {
  return {
    afterResolve: (s, entry) => {
      // §8.5 自動配戴:有判定維度→配該維里程碑稱號;否則配群俠錄/均衡
      const checkStats = entry.judgedDim ? { [entry.judgedDim]: 1 } : undefined;
      entry.equippedTitle = equippedTitle(s, data, checkStats).title;
      // 名次只在「看得到榜」的事件裡揭曉(§9.9 得知管道);其餘事件一律不動名次,
      // 玩家頁面上的數字就停在上次看榜的那一刻。
      const via = rankingRevealOf(entry, data);
      entry.rankingRevealedBy = via;
      entry.ranking = via ? revealRanking(s, data, entry.date, via) : null;
    },
    onDeath: (s) => {
      if (!s.rebirth) s.rebirth = { progress: newTrialProgress() };
    }
  };
}

/**
 * 選擇選項(immediate 事件傳 null)。回傳 {done, sub?, entry?}。
 * done=false 表示進入巢狀抉擇,續呼叫 chooseSub。
 */
export function chooseOption(state, data, choiceId, todayStr, rng = Math.random) {
  return chooseOptionV2(state, data, choiceId, todayStr, rng, finalizeHooks(state, data));
}

/** 巢狀抉擇第二步 */
export function chooseSub(state, data, subId, todayStr, rng = Math.random) {
  return chooseSubV2(state, data, subId, todayStr, rng, finalizeHooks(state, data));
}

export function gainItem(state, data, itemId) {
  const item = data.items.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`未知物品:${itemId}`);
  state.inventory[itemId] = (state.inventory[itemId] || 0) + 1;
  if (item.expOnGain) addExp(state, item.expOnGain, data); // 秘笈:入手即永久加成
  if (item.flagOnGain) state.flags[item.flagOnGain] = true;
}

/**
 * 使用消耗品。兩類:
 * cures 類(舊版療傷藥)→ 回傳解除的 debuff id;無可解除則不消耗,回 null。
 * restore 類(金創藥/酸梅,§4 恢復)→ 回傳 {restore: {hp?, tili?, qi?}} 實際恢復量;創角前無資源,回 null。
 */
export function useItem(state, data, itemId) {
  const item = data.items.items.find((i) => i.id === itemId);
  if (!item || item.type !== "consumable") return null;
  if (!(state.inventory[itemId] > 0)) return null;

  if (item.cures) {
    const target = state.debuffs.find((d) => item.cures.includes(d));
    if (!target) return null;
    state.debuffs = state.debuffs.filter((d) => d !== target);
    consumeOne(state, itemId);
    return target;
  }

  if (item.restore) {
    if (!state.resources) return null;
    const max = resourceMax(state);
    const restored = {};
    for (const [key, amount] of Object.entries(item.restore)) {
      const before = state.resources[key];
      state.resources[key] = Math.min(max[key], before + amount);
      restored[key] = state.resources[key] - before;
    }
    consumeOne(state, itemId);
    return { restore: restored };
  }
  return null;
}

function consumeOne(state, itemId) {
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] === 0) delete state.inventory[itemId];
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
