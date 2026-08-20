// 計時修煉:按分鐘的運動不再手動填數字,改由「開始修煉→收功」實際計時(防洗分)
// 純邏輯、無 DOM;時間一律由呼叫端傳入,方便測試。

import { logExercise } from "./game.js";

/** 開始計時。僅限按分鐘計算的運動;已有修煉進行中則擋下 */
export function startTraining(state, data, exerciseId, now) {
  const ex = data.exercises.exercises.find((e) => e.id === exerciseId);
  if (!ex) throw new Error(`未知運動:${exerciseId}`);
  if (ex.category !== "minute") throw new Error("此運動不採計時制");
  if (state.training) throw new Error("已有修煉進行中");
  state.training = { exerciseId, startedAt: now };
  return state.training;
}

export function trainingElapsedMs(state, now) {
  if (!state.training) return 0;
  return Math.max(0, now - state.training.startedAt);
}

/**
 * 收功:依實際經過的完整分鐘數登記。
 * 不足 1 分鐘 → 不登記,回傳 null(training 一律清除)。
 * 單次以 maxSessionMinutes 封頂,防忘記收功掛一整夜灌經驗。
 */
export function stopTraining(state, data, date, now) {
  if (!state.training) throw new Error("沒有進行中的修煉");
  const { exerciseId } = state.training;
  const max = data.exercises.maxSessionMinutes ?? Infinity;
  const minutes = Math.min(max, Math.floor(trainingElapsedMs(state, now) / 60000));
  state.training = null;
  if (minutes < 1) return null;
  const { effective, gains, actionSteps } = logExercise(state, data, exerciseId, minutes, date);
  return { exerciseId, minutes, effective, gains, actionSteps };
}

/** 放棄本次計時,不登記任何量 */
export function cancelTraining(state) {
  state.training = null;
}
