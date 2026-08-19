// ⚠️ 已停用:舊版事件判定公式(v1 規格書 §4.4)。
// v2 總綱 §0.3 已用標籤引擎公式取代(見 src/engine/tags.js 的 successRateV2),
// game.js 不再呼叫本函式。保留 successRate 僅供歷史對照/既有測試,不要在新程式碼中使用。
//
// 成功率 = 50% + (相關基本功值 − 難度門檻) ÷ 難度門檻 × 50%,夾在 5%~95%。

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
