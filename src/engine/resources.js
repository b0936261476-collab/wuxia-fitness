// 三大狀態資源(v2 總綱 第四章)
// 公式原則:消耗/傷害端絕對值、恢復端百分比;血量/內力平方根遞減、體力線性;
// DEBUFF 閾值語意一律「低於」(嚴格 <)。純函數、無 DOM。

// ---------- 上限公式(§4.1–4.3) ----------

/** 血量上限 = 500 + 根骨×100 × (1 + 0.02×√六維等級總和) */
export function hpMax(genggu, sixdimLevelSum) {
  return 500 + genggu * 100 * (1 + 0.02 * Math.sqrt(Math.max(0, sixdimLevelSum)));
}

/** 內力上限 = 500 + 根骨×200 × (1 + 0.025×√內功等級) */
export function qiMax(genggu, neigongLevel) {
  return 500 + genggu * 200 * (1 + 0.025 * Math.sqrt(Math.max(0, neigongLevel)));
}

/** 體力上限 = 1000 + 根骨×10 + (輕功+硬功+軟功 等級和)×25(線性,不隨狀態變化) */
export function tiliMax(genggu, lightHardSoftLevelSum) {
  return 1000 + genggu * 10 + lightHardSoftLevelSum * 25;
}

/**
 * 依目前天賦與六維等級,一次算出三資源上限。
 * @param {number} genggu           根骨天賦值(創角前呼叫端應傳基準值50)
 * @param {object} levels           {light, inner, hard, soft, eye, ear} 六維等級
 */
export function allMax(genggu, levels) {
  const sixdimLevelSum = Object.values(levels).reduce((a, b) => a + b, 0);
  const lightHardSoftSum = (levels.light ?? 0) + (levels.hard ?? 0) + (levels.soft ?? 0);
  return {
    hp: hpMax(genggu, sixdimLevelSum),
    qi: qiMax(genggu, levels.inner ?? 0),
    tili: tiliMax(genggu, lightHardSoftSum)
  };
}

// ---------- 傷害檔位(§4.1) ----------

export const DAMAGE_TIERS = { light: 150, medium: 500, heavy: 1200 };

// ---------- 消耗/傷害/恢復(絕對值,§4總則) ----------

/** 扣資源,絕對值,不會扣到負值 */
export function applyDamage(current, amount) {
  return Math.max(0, current - amount);
}

/**
 * 自然恢復:百分比 × 上限 × 時數,可疊加倍率(如體力當日有運動 ×1.5,§4.3)。
 * 不會超過上限。
 */
export function recover(current, max, ratePerHour, hours, multiplier = 1) {
  return Math.min(max, current + max * ratePerHour * hours * multiplier);
}

export const RECOVERY_RATE = { hp: 0.20, qi: 0.30, tili: 0.20 }; // 每小時(§4.1/4.2/4.3)
export const TILI_EXERCISE_RECOVERY_MULTIPLIER = 1.5; // 當日有運動紀錄(§4.3)

export const TILI_COST_PER_EVENT = 100; // §4.3/§6.1

// ---------- DEBUFF 閾值(§4:一律「低於」,嚴格 <) ----------

export const LIGHT_THRESHOLD = 0.30;
export const HEAVY_THRESHOLD = 0.10;

/** @returns {"heavy"|"light"|null} */
function tierOf(percent) {
  if (percent < HEAVY_THRESHOLD) return "heavy";
  if (percent < LIGHT_THRESHOLD) return "light";
  return null;
}

export const hpTier = tierOf;
export const qiTier = tierOf;
export const tiliTier = tierOf;

// 供標籤引擎(tags.js resourceContribution)直接複用的 debuffTable,單一數字來源。
export const HP_DEBUFF_TABLE = [
  { belowPercent: LIGHT_THRESHOLD, familyMod: -0.10 }, // §4.1 <30% 血量相關判定失敗率+10%
  { belowPercent: HEAVY_THRESHOLD, familyMod: -0.50 }  // <10% +50%
];
export const QI_DEBUFF_TABLE = [
  { belowPercent: LIGHT_THRESHOLD, familyMod: -0.20 }, // §4.2 <30% 戰鬥/內力相關判定-20%
  { belowPercent: HEAVY_THRESHOLD, familyMod: -0.40 }  // <10% -40%
];
export const TILI_DEBUFF_TABLE = [
  { belowPercent: LIGHT_THRESHOLD, familyMod: -0.20 }, // §4.3 <30% 進入事件成功率-20%
  { belowPercent: HEAVY_THRESHOLD, familyMod: -0.50 }  // <10% -50%
];

function familyModFromTable(percent, table) {
  let mod = 0;
  for (const row of table) if (percent < row.belowPercent) mod = row.familyMod;
  return mod;
}

/**
 * 血量 DEBUFF 效果(§4.1):
 *   <30%【輕傷】六維-30%、血量相關判定失敗率+10%
 *   <10%【重傷】六維-50%、血量相關判定失敗率+50%
 * sixdimMultiplier 是額外效果(血量獨有,施加於判定用的「玩家相關等級」);
 * hpRelSuccessMod 取自 HP_DEBUFF_TABLE,與標籤引擎共用同一份數字。
 */
export function hpDebuffEffects(percent) {
  const tier = hpTier(percent);
  const sixdimMultiplier = tier === "heavy" ? 0.5 : tier === "light" ? 0.7 : 1;
  return { tier, sixdimMultiplier, hpRelSuccessMod: familyModFromTable(percent, HP_DEBUFF_TABLE) };
}

/**
 * 內力 DEBUFF 效果(§4.2):
 *   <30%【真氣渙散】招式攻擊力-20%(武學系統二期,此處暫不落地)、戰鬥/內力相關判定-20%
 *   <10%【氣息紊亂】-40% / -40%
 */
export function qiDebuffEffects(percent) {
  return { tier: qiTier(percent), qiRelSuccessMod: familyModFromTable(percent, QI_DEBUFF_TABLE) };
}

/**
 * 體力 DEBUFF 效果(§4.3):
 *   <30%【略感乏力】進入事件成功率-20%
 *   <10%【力不從心】-50%
 */
export function tiliDebuffEffects(percent) {
  return { tier: tiliTier(percent), tiliRelSuccessMod: familyModFromTable(percent, TILI_DEBUFF_TABLE) };
}

/** 血量歸零判定(§4.1【重生】/§5.1) */
export function isDead(hpCurrent) {
  return hpCurrent <= 0;
}

/** 內力耗竭判定(§4.2【真元耗竭】) */
export function isQiExhausted(qiCurrent) {
  return qiCurrent <= 0;
}

/** 體力耗竭判定(§4.3【筋疲力竭】) */
export function isTiliExhausted(tiliCurrent) {
  return tiliCurrent <= 0;
}
