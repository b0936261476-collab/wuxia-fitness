// 重生與防刷(v2 總綱 §1.5 根骨成長 / §5.1 重生 / §5.2 方案B)
// 純邏輯、無 DOM。

/** 六大試煉(§4.1【重生】/§5.1):全部引用運動庫動作定義 */
export const SIX_TRIALS = [
  { exerciseId: "paobu", label: "跑步", target: 30 },              // 30分
  { exerciseId: "yujia", label: "瑜珈", target: 30 },              // 30分
  { exerciseId: "fudi", label: "伏地挺身", target: 100 },          // 100下
  { exerciseId: "yangwoqizuo", label: "仰臥起坐", target: 100 },   // 100下
  { exerciseId: "shendun", label: "深蹲", target: 100 },           // 100下
  { exerciseId: "jiaohudunetiao", label: "交互蹲跳", target: 100 } // 100下
];

/**
 * 分次累積規則(⚠️ 總綱 §10.6 待辦清單標記未定案:「六大試煉判定方式感測器vs自主申報、
 * 分次累積規則」尚未拍板)。此處採最直覺的解讀:累積「原始申報量」(非扣過遞減的有效值),
 * 可分多次記錄、跨時段累積,直到六項各自達標。若之後定案的規則不同,只需改這個檔案。
 */
export function newTrialProgress() {
  const progress = {};
  for (const t of SIX_TRIALS) progress[t.exerciseId] = 0;
  return progress;
}

/** 記錄一筆練功原始量進試煉進度(非六大試煉項目的運動不計入,直接忽略) */
export function recordTrialProgress(progress, exerciseId, rawAmount) {
  if (exerciseId in progress) progress[exerciseId] += rawAmount;
}

export function isTrialComplete(progress) {
  return SIX_TRIALS.every((t) => progress[t.exerciseId] >= t.target);
}

// ---------- §5.2 方案B:根骨突破機率遞減(重生專用管道,受防刷約束) ----------

const BREAKTHROUGH_PROBABILITY_SCHEDULE = [1.0, 0.5, 0.25]; // 第1/2/3次重生
const BREAKTHROUGH_PROBABILITY_FLOOR = 0.05;                 // 第4次起殘值
export const RECOVERY_DAYS_PER_LEVEL = 30;                   // 每30天回復一級

/** @param {number} attemptLevel 第幾次重生(1起算,已套用30天回復調整後的等級) */
export function breakthroughProbability(attemptLevel) {
  if (attemptLevel <= 0) throw new Error("attemptLevel 須為正整數");
  if (attemptLevel <= BREAKTHROUGH_PROBABILITY_SCHEDULE.length) {
    return BREAKTHROUGH_PROBABILITY_SCHEDULE[attemptLevel - 1];
  }
  return BREAKTHROUGH_PROBABILITY_FLOOR;
}

/** 每 30 天回復一級(§5.2);attemptLevel 最低為 1 */
export function recoveredAttemptLevel(attemptLevel, daysSinceLastRebirth) {
  const steps = Math.floor(daysSinceLastRebirth / RECOVERY_DAYS_PER_LEVEL);
  return Math.max(1, attemptLevel - steps);
}

// ---------- §1.5 根骨突破增幅表 ----------

// 累積機率表:roll < upTo 即命中該檔(由小到大逐一檢查)
const BREAKTHROUGH_MAGNITUDE_TABLE = [
  { upTo: 0.90, amount: 1 }, // 90%
  { upTo: 0.99, amount: 2 }, // 9%
  { upTo: 1.00, amount: 3 }  // 1%
];

export function rollBreakthroughMagnitude(rng = Math.random) {
  const r = rng();
  for (const row of BREAKTHROUGH_MAGNITUDE_TABLE) {
    if (r < row.upTo) return row.amount;
  }
  return BREAKTHROUGH_MAGNITUDE_TABLE.at(-1).amount;
}

/**
 * 根骨突破判定(§5.2機率 + §1.5增幅),於重生完成(afterRebirth 檢查點)呼叫。
 * @param {number} attemptLevel 已套用30天回復後的重生次數等級
 * @param {Function} rng
 * @returns {{success:boolean, amount:number, probability:number}}
 */
export function attemptBreakthrough(attemptLevel, rng = Math.random) {
  const probability = breakthroughProbability(attemptLevel);
  const success = rng() < probability;
  const amount = success ? rollBreakthroughMagnitude(rng) : 0;
  return { success, amount, probability };
}
