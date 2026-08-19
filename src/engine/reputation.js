// 聲望系統(v2 總綱 §9.6,雙軌 v1 定版)
// 純邏輯、無 DOM。俠名(fame)/惡名(infamy)獨立累積、互不抵銷(§9.6.1)。
//
// 「見證原則」(§9.6.1 鐵律:聲望只在有人知道時變動)是內容製作紀律,不是本檔案能強制的
// 引擎規則——呼叫端(事件資料/game.js)必須自己判斷該不該呼叫 addFame/addInfamy,
// 本檔案只負責數值累積、門檻分級、評價矩陣查詢這幾件確定性的事。

export function newReputation() {
  return { fame: 0, infamy: 0, log: [] };
}

/** 俠名/惡名獨立累積,不會扣到負值(§9.6.1) */
export function addFame(reputation, amount, note) {
  reputation.fame = Math.max(0, reputation.fame + amount);
  if (note) reputation.log.push({ track: "fame", amount, note });
}

export function addInfamy(reputation, amount, note) {
  reputation.infamy = Math.max(0, reputation.infamy + amount);
  if (note) reputation.log.push({ track: "infamy", amount, note });
}

/** 依門檻表算目前階數(0起算,索引對應 data/reputation.json 的 fameTiers/infamyTiers) */
export function tierIndexFor(value, thresholds) {
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) idx = i;
  }
  return idx;
}

export function fameTierIndex(fame, reputationData) {
  return tierIndexFor(fame, reputationData.tierThresholds.fame);
}

export function infamyTierIndex(infamy, reputationData) {
  return tierIndexFor(infamy, reputationData.tierThresholds.infamy);
}

/**
 * 七階壓縮成矩陣用的 low/mid/high 三檔(§9.6.4評價矩陣只有3×3=9格)。
 * ⚠️ 總綱未給七階→三檔的分段規則,採直覺切法:0-1低、2-4中、5-6高。
 */
export function bucketOf(tierIndex) {
  if (tierIndex <= 1) return "Low";
  if (tierIndex <= 4) return "Mid";
  return "High";
}

/** 江湖評價(§9.6.4矩陣查詢) */
export function evaluationText(fame, infamy, reputationData) {
  const fTier = fameTierIndex(fame, reputationData);
  const iTier = infamyTierIndex(infamy, reputationData);
  const key = `fame${bucketOf(fTier)}_infamy${bucketOf(iTier)}`;
  return reputationData.evaluationMatrix[key];
}

/** 完整快照,供 UI/敘事引用(§9.6.5 資料結構) */
export function reputationSnapshot(reputation, reputationData) {
  const fameTier = fameTierIndex(reputation.fame, reputationData);
  const infamyTier = infamyTierIndex(reputation.infamy, reputationData);
  return {
    fame: reputation.fame,
    infamy: reputation.infamy,
    fameTier,
    infamyTier,
    fameTierLabel: reputationData.fameTiers[fameTier],
    infamyTierLabel: reputationData.infamyTiers[infamyTier],
    evaluation: evaluationText(reputation.fame, reputation.infamy, reputationData)
  };
}

/**
 * 偽君子倍算(§9.6.2③鐵律):高俠名者被見證行惡,惡名依俠名階倍增。
 * @param {number} baseInfamy 原本的惡名增量
 * @param {number} fameTier   目前俠名階數(0起算)
 */
export function hypocriteMultiplier(baseInfamy, fameTier) {
  return baseInfamy * (1 + fameTier); // 階數越高倍率越高,§9.6.2③「名聲越高摔越重」
}

/**
 * 浪子回頭(§9.6.2④鏡像鐵律):高惡名者被見證行善,俠名發放加成。
 * @param {number} baseFame 原本的俠名增量
 * @param {number} infamyTier 目前惡名階數(0起算)
 */
export function prodigalMultiplier(baseFame, infamyTier) {
  return baseFame * (1 + infamyTier);
}
