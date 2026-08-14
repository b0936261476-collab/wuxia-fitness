// 單日累積分階遞減(規格書 §3)
// 以「當天、該項目」的累積量分階,隔日歸零重算。
// 同一筆記錄跨越多個階梯時分段計算,確保拆單登記與整批登記結果相同。

export const DEFAULT_COEFFICIENTS = [1.0, 0.85, 0.7, 0.55, 0.4];

/**
 * 計算一筆新記錄的「有效量」。
 * @param {number} prevCum  當天該項目在本筆之前的累積原始量
 * @param {number} amount   本筆原始量
 * @param {number} tierSize 該運動的階梯大小
 * @param {number[]} coefficients 各階係數,最後一項為封底
 * @returns {number} 有效量
 */
export function effectiveAmount(prevCum, amount, tierSize, coefficients = DEFAULT_COEFFICIENTS) {
  if (amount <= 0 || tierSize <= 0) return 0;
  const last = coefficients.length - 1;
  let effective = 0;
  let pos = prevCum;
  let remaining = amount;
  while (remaining > 0) {
    const tierIdx = Math.min(Math.floor(pos / tierSize), last);
    if (tierIdx >= last) {
      // 封底階,不再切段
      effective += remaining * coefficients[last];
      break;
    }
    const tierEnd = (tierIdx + 1) * tierSize;
    const chunk = Math.min(remaining, tierEnd - pos);
    effective += chunk * coefficients[tierIdx];
    pos += chunk;
    remaining -= chunk;
  }
  return effective;
}

/**
 * 目前所在階的係數(給 UI 顯示用)。
 */
export function currentCoefficient(cum, tierSize, coefficients = DEFAULT_COEFFICIENTS) {
  const last = coefficients.length - 1;
  const tierIdx = Math.min(Math.floor(cum / tierSize), last);
  return coefficients[tierIdx];
}
