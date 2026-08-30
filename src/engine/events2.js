// 事件引擎 v2(《事件庫生產規格書 v1》schema)
// 四段敘事(起承轉合)、察覺判定(§9.11.1)、際遇判定、巢狀抉擇、三段形態(§6.5)、
// fameVariants 聲望反應、勞務折銀(§9.11.4)。
// 純邏輯、無 DOM;rng 與日期一律由呼叫端傳入,方便測試。

import { levelFromExp, DIMENSIONS } from "./exp.js";
import { successRateV2 } from "./tags.js";
import {
  HP_DEBUFF_TABLE, QI_DEBUFF_TABLE, TILI_DEBUFF_TABLE,
  hpDebuffEffects, isDead, applyDamage, TILI_COST_PER_EVENT, allMax
} from "./resources.js";
import { addFame, addInfamy, fameTierIndex, infamyTierIndex, hypocriteMultiplier, prodigalMultiplier } from "./reputation.js";
import { titleTiers, balancedTier } from "./titles.js";
import { classifyFate } from "./talent.js";

/** 判定標籤 key ↔ 六維內部 key 對照(tags.json 用拼音,exp 池用英文) */
export const TAG_TO_DIM = {
  qinggong: "light", neigong: "inner", yinggong: "hard",
  ruangong: "soft", yangong: "eye", ergong: "ear"
};

export function sixdimLevels(state) {
  const out = {};
  for (const d of DIMENSIONS) out[d] = levelFromExp(state.exp[d]);
  return out;
}

function dimLevelOfTag(state, tag) {
  const dim = TAG_TO_DIM[tag];
  if (!dim) return 0;
  return sixdimLevels(state)[dim];
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function eventById(data, id) {
  return data.events.pool.find((e) => e.eventId === id);
}

function cfg(data) {
  return data.events.config;
}

function daysBetween(dateA, dateB) {
  return Math.floor((Date.parse(dateB + "T00:00:00Z") - Date.parse(dateA + "T00:00:00Z")) / 86400000);
}

// ---------- 察覺判定(§9.11.1 察覺三角色之二) ----------

/**
 * 察覺:等級 ≥ 隱蔽度×2 必見不擲;< 隱蔽度÷2 必盲不擲;中間擲 50%+級差×3%(夾5–95%)。
 * 回傳 {seen, crush}。crushReveal 門檻為確定性判斷(等級到了就看得見整個局)。
 */
export function perceptionCheck(state, data, ev, rng = Math.random) {
  const p = ev.perception;
  if (!p) return { seen: false, crush: false };
  const c = cfg(data).judgment;
  const level = dimLevelOfTag(state, p.tag);
  const concealment = p.concealment;

  let seen;
  if (level >= concealment * c.perceptionMustSeeRatio) seen = true;
  else if (level < concealment * c.perceptionMustBlindRatio) seen = false;
  else {
    const rate = clamp(0.5 + (level - concealment) * c.perLevelRate, c.clampMin, c.clampMax);
    seen = rng() < rate;
  }

  let crush = false;
  if (seen && p.crushReveal) {
    const t = p.crushReveal.threshold;
    crush = dimLevelOfTag(state, t.tag) >= t.min;
  }
  return { seen, crush };
}

// ---------- 判定(出手/際遇) ----------

/** 選項的「玩家相關等級」:tags 取等級最高維(pickBestTag)或第一個 tag */
function relevantLevelForOption(state, opt) {
  const tags = opt.tags || [];
  if (!tags.length) return { level: 0, tag: null };
  let best = { level: -1, tag: null };
  for (const tag of tags) {
    const lv = dimLevelOfTag(state, tag);
    if (lv > best.level) best = { level: lv, tag };
    if (!opt.pickBestTag) break; // 非擇優:只取第一個
  }
  return best;
}

/**
 * 選項判定成功率。
 * judgeType: 預設=出手判定(標籤引擎 §0.3);"fortune"=際遇判定(§9.11.1③,只看運氣);
 * "fortune_light"=際遇判定+輕判加成(暫定值,見 config)。
 */
export function optionSuccessRate(state, data, ev, opt) {
  const c = cfg(data).judgment;

  if (opt.judgeType === "fortune" || opt.judgeType === "fortune_light") {
    const yunqi = state.talents?.yunqi ?? 50;
    let rate = c.fortuneBase + (yunqi - 50) * c.fortunePerLuckPoint;
    if (opt.judgeType === "fortune_light") rate += c.fortuneLightBonus;
    return clamp(rate, c.clampMin, c.clampMax);
  }

  const { level, tag } = relevantLevelForOption(state, opt);
  let relevantLevel = level;
  const percents = resourcePercentsOf(state);
  if (percents) relevantLevel *= hpDebuffEffects(percents.hp).sixdimMultiplier; // §4.1 血量DEBUFF六維乘數

  const benchmark = (ev.benchmarkLevel ?? 0) + (opt.benchmarkModifier ?? 0);

  // 標籤修正:tagBlock.ability 去掉判定主維(避免與等級差重複計算)+ 稱號輕加成
  const abilityTags = (ev.tagBlock?.ability || []).filter((t) => t !== tag);
  const judgedDim = tag ? TAG_TO_DIM[tag] : null;
  const titleTagList = [...(judgedDim ? [`title_${judgedDim}`] : []), "title_balanced"];

  return successRateV2({
    relevantLevel,
    benchmarkLevel: benchmark,
    tagList: [...abilityTags, ...titleTagList],
    ctx: {
      talents: state.talents ?? undefined,
      eventCategory: ev.eventType === "fortune" ? "yunqi_event" : "general_event",
      sixdimLevels: sixdimLevels(state),
      resourcePercents: percents ?? undefined,
      debuffTables: percents ? { hp: HP_DEBUFF_TABLE, qi: QI_DEBUFF_TABLE, tili: TILI_DEBUFF_TABLE } : undefined,
      titleTiers: titleTiers(state),
      balancedTier: balancedTier(state)
    },
    tagsData: data.tags
  });
}

function resourceMaxOf(state) {
  if (!state.talents) return null;
  return allMax(state.talents.genggu, sixdimLevels(state));
}

function resourcePercentsOf(state) {
  if (!state.resources || !state.talents) return null;
  const max = resourceMaxOf(state);
  return {
    hp: state.resources.hp / max.hp,
    qi: state.resources.qi / max.qi,
    tili: state.resources.tili / max.tili
  };
}

// ---------- 三段形態(§6.5)與聲望變體 ----------

function fameTierOf(state, data) {
  if (!data.reputation) return 0;
  return fameTierIndex(state.reputation?.fame ?? 0, data.reputation);
}

/** 序00 命格分歧軸:均衡/單低走 default,其餘取最高軸(§1.3 顆粒度C的體感分歧) */
function fateAxisOf(state) {
  if (!state.talents) return "default";
  const cat = classifyFate(state.talents).category;
  if (cat === "balanced" || cat === "single_low") return "default";
  const axes = ["genggu", "wuxing", "yunqi"];
  return axes.reduce((a, b) => (state.talents[a] >= state.talents[b] ? a : b));
}

function matchTierKey(variants, tier) {
  if (!variants) return null;
  for (const key of Object.keys(variants)) {
    const m = key.match(/^fameTier>=(\d+)$/);
    if (m && tier >= Number(m[1])) return variants[key];
  }
  return null;
}

/** 判定型事件的形態:crush(輾壓,跳判定)/awe(仰望)/normal */
export function eventForm(state, data, ev) {
  if (ev.benchmarkLevel == null || !(ev.eventType === "duel" || ev.eventType === "fortune")) return "normal";
  const c = cfg(data).judgment;
  const sixdimTags = (ev.tagBlock?.ability || []).filter((t) => TAG_TO_DIM[t]);
  const best = Math.max(0, ...sixdimTags.map((t) => dimLevelOfTag(state, t)));
  const ratio = best / ev.benchmarkLevel;
  if (ratio >= c.crushRatio && ev.variants?.crush) return "crush";
  if (ratio < c.aweRatio && ev.variants?.awe) return "awe";
  return "normal";
}

// ---------- 勞務折銀(§9.11.4) ----------

/** 開始湊錢:記錄起始日,之後每個「滿日」掙一兩 */
export function startLabor(state, todayStr) {
  state.labor = { active: true, startDate: todayStr, dayPoints: {}, fullDates: [], lastExerciseDate: null };
}

/** 練功掛鉤:湊錢中,當日有效經驗總量達門檻=滿日(一天至多一兩) */
export function laborOnExercise(state, data, date, effectiveExpTotal) {
  const labor = state.labor;
  if (!labor?.active) return;
  labor.lastExerciseDate = date;
  labor.dayPoints[date] = (labor.dayPoints[date] || 0) + effectiveExpTotal;
  const threshold = cfg(data).labor.dailyEffectiveExpThreshold;
  if (labor.dayPoints[date] >= threshold && !labor.fullDates.includes(date)) {
    labor.fullDates.push(date);
  }
}

/**
 * 勞務結算判定:湊齊(intime/late)或放棄(abandoned),否則 null(還在湊)。
 * intime = 前 deadlineDays 天內天天滿日湊齊;late = 漏日但補滿;abandoned = 連續 abandonZeroDays 天零運動。
 */
export function laborSettlement(state, data, todayStr) {
  const labor = state.labor;
  if (!labor?.active) return null;
  const rule = cfg(data).labor;
  if (labor.fullDates.length >= rule.targetFullDays) {
    const sorted = [...labor.fullDates].sort();
    const lastNeeded = sorted[rule.targetFullDays - 1];
    return daysBetween(labor.startDate, lastNeeded) <= rule.deadlineDays ? "intime" : "late";
  }
  const lastActive = labor.lastExerciseDate || labor.startDate;
  if (daysBetween(lastActive, todayStr) >= rule.abandonZeroDays) return "abandoned";
  return null;
}

// ---------- 抽選 ----------

function conditionsMet(state, ev, todayStr, data) {
  const cond = ev.conditions || {};
  if (cond.reputation) { // 聲望門檻:俠名/惡名未達階者抽不到(規格書 conditions.reputation)
    if (cond.reputation.fameTier != null && fameTierOf(state, data) < cond.reputation.fameTier) return false;
    if (cond.reputation.infamyTier != null) {
      const iTier = data.reputation ? infamyTierIndex(state.reputation?.infamy ?? 0, data.reputation) : 0;
      if (iTier < cond.reputation.infamyTier) return false;
    }
  }
  for (const req of cond.requireFlags || []) {
    const alternatives = req.split("|");
    if (!alternatives.some((f) => state.flags[f])) return false;
  }
  for (const [key, minDays] of Object.entries(cond.minDaysSince || {})) {
    let sinceDate = null;
    if (key.startsWith("flag:")) {
      sinceDate = state.flagDates?.[key.slice(5)];
    } else {
      const entry = [...state.journal].reverse().find((j) => j.id === key);
      sinceDate = entry?.date;
    }
    if (!sinceDate) return false; // 引用的事件/flag 還沒發生
    if (daysBetween(sinceDate, todayStr) < minDays) return false;
  }
  return true;
}

function cooldownReady(state, ev) {
  if (!ev.cooldown) return true;
  const last = [...state.journal].reverse().find((j) => j.id === ev.eventId);
  if (!last) return true;
  return state.steps.resolved - last.n >= ev.cooldown;
}

/** 可抽選的事件與權重(weightFlags 暗線加權) */
export function eligibleEvents(state, data, todayStr) {
  return data.events.pool
    .filter((ev) => !ev.triggerOnly)
    .filter((ev) => conditionsMet(state, ev, todayStr, data))
    .filter((ev) => cooldownReady(state, ev))
    .map((ev) => {
      let weight = 1;
      for (const [flag, w] of Object.entries(ev.conditions?.weightFlags || {})) {
        if (state.flags[flag]) weight += w;
      }
      return { ev, weight };
    });
}

/** 序章序列(PRIORITY):創角完成後,前幾個事件槽依 config.intro.sequence 固定順序 */
function nextIntroEventId(state, data) {
  if (!state.talents) return null; // 尚未創角,序00 的命格分歧無從談起
  const seq = cfg(data).intro?.sequence || [];
  return seq.find((id) => !state.journal.some((j) => j.id === id)) ?? null;
}

export function drawEventV2(state, data, todayStr, rng = Math.random) {
  // 勞務結算優先插隊(PRIORITY:欠的債,先於一切閒事)
  const settlement = laborSettlement(state, data, todayStr);
  if (settlement) {
    return { id: cfg(data).labor.settlementEventId, laborOutcome: settlement };
  }
  // 序章三部曲固定順序(PRIORITY_INTERRUPT)
  const intro = nextIntroEventId(state, data);
  if (intro) return { id: intro, isIntro: true };

  const candidates = eligibleEvents(state, data, todayStr);
  if (!candidates.length) return null;
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  let roll = rng() * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return { id: c.ev.eventId };
  }
  return { id: candidates[candidates.length - 1].ev.eventId };
}

// ---------- 天賦耳語(§8.6) ----------

/**
 * 依極端天賦擲耳語。回傳一句文案或 null。
 * 觸發條件:任一天賦 >120 或 <10;機率/冷卻/閾值全在 data/whispers.json。
 */
export function rollWhisper(state, data, rng = Math.random) {
  const w = data.whispers;
  if (!w?.pools || !state.talents) return null;
  if (state.lastWhisperN != null && state.steps.resolved - state.lastWhisperN < w.cooldownEvents) return null;

  const axisMap = { genggu: "genggu", wuxing: "wuxing", yunqi: "yunqi" };
  const candidates = [];
  for (const axis of Object.keys(axisMap)) {
    const v = state.talents[axis];
    if (v > w.highThreshold && w.pools[`high_${axis}`]?.length) candidates.push(`high_${axis}`);
    if (v < w.lowThreshold && w.pools[`low_${axis}`]?.length) candidates.push(`low_${axis}`);
  }
  if (!candidates.length) return null;
  if (rng() >= w.probability) return null;
  const pool = w.pools[candidates[Math.floor(rng() * candidates.length)]];
  return pool[Math.floor(rng() * pool.length)];
}

// ---------- 模板變數(§8.4〔排行相關〕) ----------

/** 文案中的譜錄模板變數替換,如 {輕功譜第1名.人名} */
function fillTemplates(text, data) {
  if (!text || !text.includes("{")) return text;
  const rank1 = data.npcs?.top100?.find((n) => n.rank === 1);
  return text
    .replaceAll("{輕功譜第1名.人名}", rank1?.name ?? "沈聽雪")
    .replaceAll("{玩家.稱號}", "〔稱號〕");
}

// ---------- 事件生命週期:start → present → choose(→ chooseSub)→ 結算 ----------

/**
 * 抽下一個事件,寫入 state.pendingEvent(可序列化,重載後可續)。
 * 回傳 pendingEvent 或 null(沒有事件可走)。
 */
export function startEventV2(state, data, todayStr, rng = Math.random) {
  const drawn = drawEventV2(state, data, todayStr, rng);
  if (!drawn) return null;
  const ev = eventById(data, drawn.id);

  const perception = perceptionCheck(state, data, ev, rng);
  const form = drawn.laborOutcome ? "normal" : eventForm(state, data, ev);
  const tier = fameTierOf(state, data);

  const pending = {
    v2: true,
    id: ev.eventId,
    date: todayStr,
    perception,
    form,
    fameTier: tier,
    laborOutcome: drawn.laborOutcome ?? null,
    isIntro: drawn.isIntro ?? false,
    phase: "cheng"
  };

  // 天賦耳語(§8.6 NARRATIVE_INJECT):序章與勞務結算豁免;機率+冷卻由 whispers.json 管
  if (!drawn.isIntro && !drawn.laborOutcome) {
    const whisper = rollWhisper(state, data, rng);
    if (whisper) {
      pending.whisper = whisper;
      state.lastWhisperN = state.steps.resolved;
      state.whisperSeen = true; // 命譜前保底檢查用(§8.6)
    }
  }

  // 察覺失敗 + gateEvent:整件降級為平淡版(§9.11.2④:沒看見的人拿到普通版世界)
  if (ev.perception?.gateEvent && !perception.seen && ev.unperceivedVersion) {
    pending.gate = "unperceived";
  }
  // 察覺即得 flag(如 DA-001 dyg_rumor_heard)
  if (perception.seen && ev.perception?.setFlags) {
    setFlags(state, ev.perception.setFlags, null, todayStr);
  }

  state.pendingEvent = pending;
  return pending;
}

/** 呈現用視圖(UI 讀這個渲染,不直接碰資料檔細節) */
export function presentEventV2(state, data) {
  const pending = state.pendingEvent;
  if (!pending?.v2) return null;
  const ev = eventById(data, pending.id);
  const view = {
    id: ev.eventId,
    title: ev.title,
    eventType: ev.eventType,
    form: pending.form,
    phase: pending.phase
  };

  if (pending.laborOutcome) {
    view.qi = "";
    view.choices = [];
    view.immediate = true;
    return view;
  }
  if (pending.gate === "unperceived") {
    view.qi = eventById(data, pending.id).unperceivedVersion.text;
    view.choices = [];
    view.immediate = true;
    return view;
  }

  // 輾壓/名人短路型:單一「繼續」直接結算
  const fameShort = matchTierKey(ev.variants?.fameVariant ? ev.variants.fameVariant : null, pending.fameTier);
  if (pending.form === "crush") {
    view.qi = ev.variants.crush.text;
    view.choices = [];
    view.immediate = true;
    return view;
  }
  if (fameShort && fameShort.text && !fameShort.qi) {
    view.qi = fameShort.text;
    view.choices = [];
    view.immediate = true;
    view.fameShort = true;
    return view;
  }

  // 起段:仰望版 > 名人 qi 變體 > flag 變體 > 帶傷變體 > 原文
  let qi = ev.beats.qi.text;
  if (pending.form === "awe" && ev.variants?.awe?.qi) qi = ev.variants.awe.qi;
  else if (fameShort?.qi) qi = fameShort.qi;
  else {
    const qiVariants = ev.beats.qi.variants || {};
    for (const [key, text] of Object.entries(qiVariants)) {
      if (key.startsWith("flag:") && state.flags[key.slice(5)]) { qi = text; break; }
      if (key === "injured" && isInjured(state)) { qi = text; break; }
    }
    const fameQi = matchTierKey(ev.beats.qi.fameVariants, pending.fameTier);
    if (fameQi?.text) qi = fameQi.text;
  }
  view.qi = fillTemplates(qi, data);
  if (pending.whisper) view.whisper = pending.whisper;
  if (pending.perception.seen) view.revealText = ev.perception?.revealText;
  if (pending.perception.crush) view.crushText = ev.perception?.crushReveal?.text;

  if (pending.phase === "sub") {
    view.subPrefixText = pending.subPrefixText;
    view.choices = currentSubChoices(data, pending).map((s) => ({ id: s.id, text: s.text }));
    return view;
  }

  view.choices = (ev.beats.cheng.choices || [])
    .filter((c) => !c.autoWhenInsufficient) // 金錢系統上線前一律視為湊得出(1-4 設計註②)
    .filter((c) => !c.requirePerception || pending.perception.seen)
    .filter((c) => !c.requireCrush || pending.perception.crush)
    .map((c) => ({ id: c.id, text: c.text, judged: !!c.judge }));
  view.immediate = view.choices.length === 0;
  return view;
}

function isInjured(state) {
  const p = resourcePercentsOf(state);
  return p ? p.hp < 0.3 : false;
}

function currentSubChoices(data, pending) {
  const ev = eventById(data, pending.id);
  let outcome = ev.beats.he.byChoice[pending.subSource];
  if (pending.subBranch) outcome = outcome[pending.subBranch]; // success/fail 分支下的 subChoices
  return outcome.subChoices;
}

/**
 * 選擇一個選項(無選項的 immediate 事件傳 null)。
 * 回傳:{done:false, sub:true} 表示進入巢狀抉擇(再呼叫 chooseSubV2);
 *       {done:true, entry} 表示已結算。
 */
export function chooseOptionV2(state, data, choiceId, todayStr, rng = Math.random, finalizeHooks = {}) {
  const pending = state.pendingEvent;
  if (!pending?.v2) throw new Error("沒有進行中的 v2 事件");
  if (pending.phase === "sub") throw new Error("巢狀抉擇中,請用 chooseSubV2");
  const ev = eventById(data, pending.id);

  // 結算型:勞務結算 / 平淡版 / 輾壓 / 名人短路
  if (pending.laborOutcome) {
    const outcome = ev.beats.he.byOutcome[pending.laborOutcome];
    state.labor = null;
    return finalize(state, data, pending, ev, { outcome, resultText: outcome.text }, todayStr, rng, finalizeHooks);
  }
  if (pending.gate === "unperceived") {
    return finalize(state, data, pending, ev, { outcome: { effects: {} }, resultText: ev.unperceivedVersion.text }, todayStr, rng, finalizeHooks);
  }
  if (pending.form === "crush") {
    const outcome = ev.variants.crush;
    return finalize(state, data, pending, ev, { outcome, resultText: outcome.text }, todayStr, rng, finalizeHooks);
  }
  const fameShort = matchTierKey(ev.variants?.fameVariant, pending.fameTier);
  if (fameShort && fameShort.text && !fameShort.qi) {
    return finalize(state, data, pending, ev, { outcome: fameShort, resultText: fameShort.text }, todayStr, rng, finalizeHooks);
  }

  // 無選項事件(序章/日常直敘):he.byFate 依命格分歧、he.byFlag 依抉擇紀錄分版本(L1回聲),或 he.text 直接收尾
  if ((ev.beats.cheng.choices || []).length === 0) {
    const he = ev.beats.he;
    if (he.byFate) {
      const axis = fateAxisOf(state);
      const body = he.byFate[axis] ?? he.byFate.default;
      const text = body + (he.epilogue ? "\n\n" + he.epilogue : "");
      return finalize(state, data, pending, ev, { outcome: { effects: he.effects ?? {} }, resultText: text }, todayStr, rng, finalizeHooks);
    }
    if (he.byFlag) {
      // 依序比對:第一個命中的 flag 版本;都沒中用 default(§9.11 L1 回聲——世界記得你做過的事)
      let hit = he.byFlag.find((v) => v.flags.split("|").some((f) => state.flags[f])) ?? he.default;
      const fameHit = matchTierKey(hit.fameVariants, pending.fameTier); // 出名之後,回聲也換一種講法(§9.6.2)
      if (fameHit) hit = { ...hit, ...fameHit, fameVariants: undefined };
      return finalize(state, data, pending, ev, { outcome: hit, resultText: hit.text }, todayStr, rng, finalizeHooks);
    }
    {
      let outcome = he;
      const fameHit = matchTierKey(he.fameVariants, pending.fameTier);
      if (fameHit) outcome = { ...he, ...fameHit, fameVariants: undefined };
      return finalize(state, data, pending, ev, { outcome, resultText: outcome.text }, todayStr, rng, finalizeHooks);
    }
  }

  const opt = (ev.beats.cheng.choices || []).find((c) => c.id === choiceId);
  if (!opt) throw new Error(`未知選項:${choiceId}`);
  if (opt.requirePerception && !pending.perception.seen) throw new Error("此選項需要察覺");
  if (opt.requireCrush && !pending.perception.crush) throw new Error("此選項需要輾壓級察覺");

  pending.choiceId = choiceId;
  pending.choiceText = opt.text;

  // 選項本身的 flag / 勞務啟動
  if (opt.setFlags) setFlags(state, opt.setFlags, opt.flagData, todayStr);
  if (opt.startsLabor) startLabor(state, todayStr);

  // 判定
  let outcome;
  if (opt.judge) {
    const rate = optionSuccessRate(state, data, ev, opt);
    const success = rng() < rate;
    pending.rate = Math.round(rate * 100) / 100;
    pending.success = success;
    pending.judgedTag = relevantLevelForOption(state, opt).tag; // 稱號自動配戴規則①用(§8.5)
    const heSource = pending.form === "awe" && ev.variants?.awe?.he ? ev.variants.awe.he : ev.beats.he.byChoice[choiceId];
    outcome = success ? heSource.success : heSource.fail;
    pending.subSource = choiceId;
    pending.subBranch = success ? "success" : "fail";
  } else {
    outcome = ev.beats.he.byChoice[choiceId];
    pending.subSource = choiceId;
    pending.subBranch = null;
  }

  // 名人版結果覆蓋(fameVariants on outcome)
  const fameOutcome = matchTierKey(outcome.fameVariants, pending.fameTier);
  if (fameOutcome) outcome = { ...outcome, ...fameOutcome, fameVariants: undefined };

  // mergeInto:先播本段文字,再併入目標選項的內容(1-4 B→A)
  let prefixText = "";
  if (outcome.mergeInto) {
    prefixText = outcome.text + "\n\n";
    pending.subSource = outcome.mergeInto;
    pending.subBranch = null;
    outcome = ev.beats.he.byChoice[outcome.mergeInto];
  }

  // 巢狀抉擇(限一層)
  if (outcome.subChoices) {
    pending.phase = "sub";
    pending.subPrefixText = prefixText + outcome.text;
    return { done: false, sub: true };
  }

  const zhuanText = pending.form === "awe" && ev.variants?.awe?.zhuan
    ? ev.variants.awe.zhuan
    : ev.beats.zhuan?.textByChoice?.[choiceId];
  return finalize(state, data, pending, ev, { outcome, resultText: prefixText + outcome.text, zhuanText }, todayStr, rng, finalizeHooks);
}

/** 巢狀抉擇第二步 */
export function chooseSubV2(state, data, subId, todayStr, rng = Math.random, finalizeHooks = {}) {
  const pending = state.pendingEvent;
  if (pending?.phase !== "sub") throw new Error("目前沒有巢狀抉擇");
  const ev = eventById(data, pending.id);
  const sub = currentSubChoices(data, pending).find((s) => s.id === subId);
  if (!sub) throw new Error(`未知選項:${subId}`);

  pending.subChoiceText = sub.text;
  let outcome = sub.result;
  const fameOutcome = matchTierKey(outcome.fameVariants, pending.fameTier);
  if (fameOutcome) outcome = { ...outcome, ...fameOutcome, fameVariants: undefined };

  return finalize(state, data, pending, ev, {
    outcome,
    resultText: outcome.text,
    prefixText: pending.subPrefixText
  }, todayStr, rng, finalizeHooks);
}

// ---------- 結算 ----------

function setFlags(state, flags, flagData, todayStr) {
  if (!state.flagDates) state.flagDates = {};
  for (const f of flags) {
    state.flags[f] = flagData?.[f] ? { ...flagData[f], set: true } : true;
    state.flagDates[f] = todayStr;
  }
}

function applyEffects(state, data, effects, todayStr, note) {
  if (!effects) return;
  if (effects.fame) {
    const iTier = data.reputation ? infamyTierIndex(state.reputation?.infamy ?? 0, data.reputation) : 0;
    addFame(state.reputation, prodigalMultiplier(effects.fame, iTier > 1 ? iTier : 0), note); // 浪子回頭(§9.6.2④)
  }
  if (effects.infamy) {
    const fTier = fameTierOf(state, data);
    addInfamy(state.reputation, hypocriteMultiplier(effects.infamy, fTier > 1 ? fTier : 0), note); // 偽君子倍算(§9.6.2③)
  }
  if (state.resources) {
    if (effects.hpDamage) state.resources.hp = applyDamage(state.resources.hp, effects.hpDamage);
    if (effects.mpDamage) state.resources.qi = applyDamage(state.resources.qi, effects.mpDamage);
    if (effects.tiliDamage) state.resources.tili = applyDamage(state.resources.tili, effects.tiliDamage);
    const max = resourceMaxOf(state);
    if (max) {
      if (effects.hpRestore) state.resources.hp = Math.min(max.hp, state.resources.hp + max.hp * effects.hpRestore);
      if (effects.mpRestore) state.resources.qi = Math.min(max.qi, state.resources.qi + max.qi * effects.mpRestore);
      if (effects.tiliRestore) state.resources.tili = Math.min(max.tili, state.resources.tili + max.tili * effects.tiliRestore);
    }
  }
  if (effects.itemGrant) {
    for (const [itemId, count] of Object.entries(effects.itemGrant)) {
      state.inventory[itemId] = (state.inventory[itemId] || 0) + count;
    }
  }
  if (effects.setFlags) setFlags(state, effects.setFlags, effects.flagData, todayStr);
  for (const f of effects.clearFlags || []) delete state.flags[f];
}

function finalize(state, data, pending, ev, { outcome, resultText, zhuanText, prefixText }, todayStr, rng, hooks) {
  let text = (prefixText ? prefixText + "\n\n" : "") + resultText;

  // 察覺者/輾壓者的加聽加看段
  if (outcome.perceivedExtra && pending.perception.seen) text += "\n\n" + outcome.perceivedExtra.text;
  if (outcome.crushExtra && pending.perception.crush) {
    text += "\n\n" + outcome.crushExtra.text;
    if (outcome.crushExtra.setFlags) setFlags(state, outcome.crushExtra.setFlags, null, todayStr);
  }
  // 結果內的二次察覺(如 FO-002 空穗環,眼功另判)
  if (outcome.extraPerception) {
    const ep = outcome.extraPerception;
    const fake = { perception: { tag: ep.tag, concealment: ep.concealment } };
    if (perceptionCheck(state, data, fake, rng).seen) {
      text += "\n\n" + ep.text;
      if (ep.setFlags) setFlags(state, ep.setFlags, null, todayStr);
    }
  }

  applyEffects(state, data, outcome.effects, todayStr, ev.eventId);

  // 收尾共用段(1-4)
  const shared = ev.beats?.he?.byChoice?.[pending.subSource]?.sharedEpilogue;
  if (shared && pending.subSource === "A") text += "\n\n" + shared;

  // §4.3/§6.1:每次事件固定消耗體力
  if (state.resources) {
    state.resources.tili = applyDamage(state.resources.tili, TILI_COST_PER_EVENT);
    if (isDead(state.resources.hp)) hooks.onDeath?.(state);
  }

  const entry = {
    n: state.steps.resolved,
    id: ev.eventId,
    source: "pool",
    type: ev.eventType,
    title: ev.title,
    date: todayStr,
    form: pending.form,
    text: pending.gate === "unperceived" ? "" : ev.beats.qi.text,
    whisper: pending.whisper ?? null,
    choice: pending.choiceText ?? null,
    subChoice: pending.subChoiceText ?? null,
    rate: pending.rate ?? null,
    success: pending.success ?? null,
    judgedDim: pending.judgedTag ? TAG_TO_DIM[pending.judgedTag] : null,
    zhuanText: zhuanText ?? null,
    resultText: fillTemplates(text, data)
  };
  hooks.afterResolve?.(state, entry); // game.js 掛榜單快照/稱號等
  state.pendingEvent = null;
  state.journal.push(entry);
  return { done: true, entry };
}
