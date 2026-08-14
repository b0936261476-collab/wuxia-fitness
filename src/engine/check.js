// 事件判定(規格書 §4.4)
// 成功率 = 50% + (相關基本功值 − 難度門檻) ÷ 難度門檻 × 50%,夾在 5%~95%。
// 相關基本功可為單項或多項加權;判定讀取事件觸發當下的六維等級。

export function successRate(statValue, difficulty, modifier = 0) {
  let rate = 0.5 + ((statValue - difficulty) / difficulty) * 0.5;
  rate += modifier; // debuff 等修正
  return Math.min(0.95, Math.max(0.05, rate));
}

/** 依 check.stats 權重表與目前各維度等級,算出加權基本功值 */
export function weightedStatValue(statWeights, levels) {
  let value = 0;
  for (const [dim, w] of Object.entries(statWeights)) {
    value += (levels[dim] ?? 0) * w;
  }
  return value;
}
