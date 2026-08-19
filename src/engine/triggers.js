// 觸發器註冊表:優先序選擇(v2 總綱 §9.1–§9.4)
// 條件判定(condition 字串求值)依賴 talent/resource/quest 等系統,將在對應系統(M3/M4)
// 上線後由呼叫端先過濾出「條件成立」的候選清單;本模組只負責「一個事件槽只消化一個
// 中斷,其餘按 priority 留佇列」這件事,先做成純函數方便獨立測試(§10.5 M2 驗收項)。

/**
 * 從已判定條件成立的 PRIORITY_INTERRUPT 候選中,選出優先權最高的一個。
 * @param {Array<{id:string, type:string, priority:number}>} candidates 條件已成立的觸發器
 * @returns {object|null} 優先權最高者;無候選則回 null
 */
export function pickInterrupt(candidates) {
  const interrupts = candidates.filter((t) => t.type === "PRIORITY_INTERRUPT");
  if (interrupts.length === 0) return null;
  return interrupts.reduce((best, t) => (t.priority > best.priority ? t : best));
}

/**
 * 篩出某檢查點下註冊的觸發器(不判斷 condition,只比對 checkpoint 掛載)。
 * @param {Array} triggers  data/triggers.json 的 triggers 陣列
 * @param {string} checkpoint 四檢查點之一
 */
export function triggersForCheckpoint(triggers, checkpoint) {
  return triggers.filter((t) => t.checkpoint.includes(checkpoint));
}

/**
 * NARRATIVE_INJECT 的機率/冷卻判定(§9.2)。cooldownState 由呼叫端維護
 * (格式:{ [triggerId]: 距上次觸發已過幾個事件 }),此函式不寫回狀態。
 * @param {object} trigger        NARRATIVE_INJECT 定義({probability, cooldown, exempt})
 * @param {object} params
 * @param {number} params.eventsSinceLastFire  距上次觸發已過的事件數(未曾觸發可傳 Infinity)
 * @param {string} params.context              目前情境標籤(如 "prologue"、"priorityInterrupt"),用於比對 exempt
 * @param {number} params.roll                 0~1 亂數(方便測試注入)
 * @returns {boolean} 是否應該注入
 */
export function shouldInject(trigger, { eventsSinceLastFire, context, roll }) {
  if (trigger.exempt?.includes(context)) return false;
  const cooldownEvents = parseCooldownEvents(trigger.cooldown);
  if (eventsSinceLastFire < cooldownEvents) return false;
  return roll < trigger.probability;
}

function parseCooldownEvents(cooldown) {
  const n = parseInt(cooldown, 10);
  return Number.isFinite(n) ? n : 0;
}
