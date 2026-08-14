// localStorage 存檔(僅瀏覽器使用)

import { newState } from "./game.js";

const KEY = "wuxia-fitness-save-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newState();
    const saved = JSON.parse(raw);
    return { ...newState(), ...saved }; // 新欄位向下相容
  } catch {
    return newState();
  }
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
  return { ...newState(), ...parsed };
}

export function resetSave() {
  localStorage.removeItem(KEY);
  return newState();
}
