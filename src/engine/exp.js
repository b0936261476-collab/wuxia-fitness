// 等級門檻與里程碑(規格書 §1.1、§5.2)

export const DIMENSIONS = ["light", "inner", "hard", "soft", "eye", "ear"];

/** 升到 Lv.N 所需累積經驗 = 100 × N × (N+1) ÷ 2 */
export function thresholdForLevel(n) {
  return (100 * n * (n + 1)) / 2;
}

/** 由累積經驗推得等級 */
export function levelFromExp(exp) {
  if (exp < 100) return 0;
  // 解 100·n·(n+1)/2 ≤ exp
  let n = Math.floor((-1 + Math.sqrt(1 + (8 * exp) / 100)) / 2);
  while (thresholdForLevel(n + 1) <= exp) n++;
  while (n > 0 && thresholdForLevel(n) > exp) n--;
  return n;
}

/** 距下一級的進度,給 UI 畫進度條 */
export function levelProgress(exp) {
  const level = levelFromExp(exp);
  const cur = thresholdForLevel(level);
  const next = thresholdForLevel(level + 1);
  return { level, current: exp - cur, needed: next - cur, next };
}

/**
 * 依累積有效經驗回傳某維度已達成的里程碑稱號(取最高一個;無則 null)。
 * thresholds 與 titles 來自 data/titles.json。
 */
export function milestoneTitle(exp, thresholds, titles) {
  let title = null;
  for (let i = 0; i < thresholds.length; i++) {
    if (exp >= thresholds[i]) title = titles[i];
  }
  return title;
}

/**
 * 經驗增減:懲罰不會扣到負值;里程碑一經解鎖永久保留。
 * (自 game.js 移入,讓事件結算的 expGrant——裴景明陪練加成——可共用,避免循環引用)
 */
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
  const levelSum = DIMENSIONS.reduce((a, d) => a + levelFromExp(state.exp[d]), 0);
  let bIdx = state.balancedMilestone ?? -1;
  while (bIdx + 1 < balancedThresholds.length && levelSum >= balancedThresholds[bIdx + 1]) bIdx++;
  if (bIdx >= 0) state.balancedMilestone = bIdx;
}
