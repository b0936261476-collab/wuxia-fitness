// 稱號系統(v2 總綱 第八章:司天監)
// 純邏輯、無 DOM。里程碑索引由 game.js 的 addExp() 維護在 state.milestones/balancedMilestone,
// 本檔案負責:①查詢對應稱號文字 ②組裝標籤引擎要用的階數資料(§8.4) ③自動配戴規則(§8.5)。

import { DIMENSIONS } from "./exp.js";

/** 玩家目前每一維的武道里程碑階數(1起算,0=未解鎖)。用於標籤引擎的 title_<dim> 標籤。 */
export function titleTiers(state) {
  const tiers = {};
  for (const dim of DIMENSIONS) tiers[dim] = (state.milestones[dim] ?? -1) + 1;
  return tiers;
}

/** 玩家目前的均衡里程碑階數(1起算,0=未解鎖)。用於標籤引擎的 title_balanced 標籤。 */
export function balancedTier(state) {
  return (state.balancedMilestone ?? -1) + 1;
}

/** 某一維目前的武道里程碑稱號文字(§8.2);未解鎖回 null */
export function milestoneTitleForDim(state, data, dim) {
  const t = data.titles.milestones;
  const idx = state.milestones[dim] ?? -1;
  return idx >= 0 ? t.titles[dim][idx] : null;
}

/** 目前的均衡里程碑稱號文字(§8.3);未解鎖回 null */
export function currentBalancedTitle(state, data) {
  const idx = state.balancedMilestone ?? -1;
  return idx >= 0 ? data.titles.balanced.titles[idx] : null;
}

/**
 * 群俠錄稱號(§8.1),依百分位查表。percentile 為「贏過多少比例的人」,例如
 * 0.95 代表前5%。rank1(全服第1名)由呼叫端另外判斷是否為 rank===1 再覆蓋。
 * tiers 陣列的 condition 由高到低排列時本函式取「符合的最高一檔」。
 */
export function rankingTitleForPercentile(percentile, data, { isRank1 = false } = {}) {
  const tiers = data.titles.ranking.tiers;
  const byCondition = Object.fromEntries(tiers.map((t) => [t.condition, t]));
  if (isRank1) return byCondition.rank1.title;
  if (percentile >= 0.999) return byCondition.top01.title;
  if (percentile >= 0.99) return byCondition.top1.title;
  if (percentile >= 0.95) return byCondition.top5.title;
  if (percentile >= 0.80) return byCondition.top20.title;
  if (percentile >= 0.50) return byCondition.top50.title;
  return byCondition.bottom50.title;
}

/**
 * 群俠錄/均衡里程碑「成就高低」比較(§8.5③ 用):
 * 兩套系統刻度不同,總綱未給換算公式,這裡採最直覺的解法——
 * 各自換算成「已解鎖階數 ÷ 總階數」的完成度百分比,取較高者。
 * ⚠️ 假設,若總綱之後有明確換算規則,以那個為準。
 */
function achievementScore(rankingTierIndex, rankingTierCount, balancedIdx, balancedCount) {
  const rankingScore = rankingTierCount > 0 ? rankingTierIndex / (rankingTierCount - 1) : 0;
  const balancedScore = balancedCount > 0 ? (balancedIdx + 1) / balancedCount : 0;
  return { rankingScore, balancedScore };
}

/**
 * 自動配戴規則(§8.5,引擎規則,玩家不可選):
 *   ① 事件有六維標籤(ev.check.stats) → 配該維最高里程碑稱號
 *   ② 多維標籤 → 配 weight 最高那維
 *   ③ 無六維標籤 → 配群俠錄稱號或均衡稱號,取成就更高者
 *   ④ 都沒有 → defaultTitle(「無名之輩」)
 * @param {object} state
 * @param {object} data          需含 data.titles
 * @param {object} [checkStats]  ev.check.stats(duel/fortune 才有);其餘事件類型不傳
 * @param {object} [ranking]     { percentile, isRank1, tierIndex }(§8.1 用,無資料時視為未上榜)
 * @returns {{title:string, source:"milestone"|"balanced"|"ranking"|"default", dim?:string}}
 */
export function equippedTitle(state, data, checkStats, ranking) {
  if (checkStats && Object.keys(checkStats).length > 0) {
    const topDim = Object.entries(checkStats).sort((a, b) => b[1] - a[1])[0][0]; // ②weight最高
    const title = milestoneTitleForDim(state, data, topDim);
    if (title) return { title, source: "milestone", dim: topDim };
    // 該維雖是本次判定重點,但玩家尚未解鎖任何里程碑 → 落到③/④邏輯繼續判斷
  }

  const balancedIdx = state.balancedMilestone ?? -1;
  const balancedTitleText = balancedIdx >= 0 ? data.titles.balanced.titles[balancedIdx] : null;
  const balancedCount = data.titles.balanced.titles.length;

  const rankingTiers = data.titles.ranking.tiers;
  const hasRanking = ranking && ranking.tierIndex != null;
  const rankingTitleText = hasRanking ? rankingTiers[ranking.tierIndex].title : null;

  if (balancedTitleText && rankingTitleText) {
    const { rankingScore, balancedScore } = achievementScore(
      ranking.tierIndex, rankingTiers.length, balancedIdx, balancedCount
    );
    return rankingScore >= balancedScore
      ? { title: rankingTitleText, source: "ranking" }
      : { title: balancedTitleText, source: "balanced" };
  }
  if (balancedTitleText) return { title: balancedTitleText, source: "balanced" };
  if (rankingTitleText) return { title: rankingTitleText, source: "ranking" };

  return { title: data.titles.defaultTitle, source: "default" };
}
