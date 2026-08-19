// localStorage 存檔(僅瀏覽器使用)

import { newState } from "./game.js";

const KEY = "wuxia-fitness-save-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newState();
    const saved = JSON.parse(raw);
    return migrate({ ...newState(), ...saved }); // 新欄位向下相容
  } catch {
    return newState();
  }
}

/** 事件庫 v2 遷移:舊格式的進行中事件已無法結算,退回該步讓玩家重抽 */
function migrate(state) {
  if (state.pendingEvent && !state.pendingEvent.v2) {
    state.pendingEvent = null;
    state.steps.resolved = Math.max(0, state.steps.resolved - 1);
  }
  return state;
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportSave(state) {
  return JSON.stringify(state, null, 2);
}

export function importSave(json) {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || !parsed.exp) throw new Error("不是有效的存檔");
  return migrate({ ...newState(), ...parsed });
}

export function resetSave() {
  localStorage.removeItem(KEY);
  return newState();
}
