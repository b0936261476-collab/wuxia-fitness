// 隱藏天賦系統(v2 總綱 第一章)
// 純邏輯、無 DOM。三天賦(根骨/悟性/運氣)由 15 題心理測驗累積-歸一化生成,
// 數值全程不顯示於任何 UI(§1.1),此檔案只負責計算,顯示與否由呼叫端(UI 層)保證。

export const TALENT_TOTAL = 150;          // 三天賦總和固定值(§1.1)
export const CONSISTENCY_THRESHOLD = 0.6;  // 設計者決定:一致性 ≥60% 即算一致(修正原總綱草稿的 0.85)
export const PRIMARY_BOOST = 1.5;          // §1.2:主傾向 ×1.5

export const AXES = ["genggu", "wuxing", "yunqi"];

/**
 * 依作答計算三軸原始權重總分(累積階段)。
 * @param {Array<{questionId: string, optionId: string}>} answers
 * @param {object} quizData  data/quiz.json
 * @returns {{genggu:number, wuxing:number, yunqi:number}}
 */
export function rawScores(answers, quizData) {
  const raw = { genggu: 0, wuxing: 0, yunqi: 0 };
  for (const { questionId, optionId } of answers) {
    const q = quizData.questions.find((x) => x.id === questionId);
    if (!q) throw new Error(`未知題目:${questionId}`);
    const opt = q.options.find((o) => o.id === optionId);
    if (!opt) throw new Error(`未知選項:${questionId}/${optionId}`);
    for (const axis of AXES) raw[axis] += opt.weights[axis] ?? 0;
  }
  return raw;
}

/**
 * 一致性指標(公式已與設計者確認):取「最高軸原始分 ÷ 三軸原始分總和」,
 * 越集中於單軸,值越接近 1;完全平均(三軸各 1/3)則為 0.333。
 */
export function consistency(raw) {
  const total = AXES.reduce((s, a) => s + raw[a], 0);
  if (total <= 0) return 0;
  const max = Math.max(...AXES.map((a) => raw[a]));
  return max / total;
}

/**
 * 累積-歸一化生成天賦值(§1.2)。
 * 1) 先按比例歸一化到總和 150
 * 2) 一致性 ≥60%(設計者定案,見 CONSISTENCY_THRESHOLD)時,主傾向軸 ×1.5
 *    (此時三軸總和會超過 150,主軸可能達 140+,§1.2 天花板敘述)
 * 不設保底下限、無重抽——由呼叫端保證只呼叫一次(§1.1)。
 * @returns {{genggu:number, wuxing:number, yunqi:number, primaryAxis:string, consistency:number, boosted:boolean}}
 */
export function generateTalents(answers, quizData) {
  const raw = rawScores(answers, quizData);
  const total = AXES.reduce((s, a) => s + raw[a], 0);
  if (total <= 0) throw new Error("作答總分為 0,無法生成天賦");

  const normalized = {};
  for (const axis of AXES) normalized[axis] = (raw[axis] / total) * TALENT_TOTAL;

  const c = consistency(raw);
  const primaryAxis = AXES.reduce((best, a) => (raw[a] > raw[best] ? a : best), AXES[0]);
  const boosted = c >= CONSISTENCY_THRESHOLD;
  if (boosted) normalized[primaryAxis] *= PRIMARY_BOOST;

  return { ...normalized, primaryAxis, consistency: c, boosted };
}

/** 悟性倍率(§1.4):運動有效經驗 × 此倍率 → 累加進經驗池 */
export function wuxingMultiplier(wuxing) {
  return 1 + (wuxing - 50) * 0.01;
}

/**
 * 極端命格判定(§8.6 唯一有明確門檻的一層):任一天賦值 >120 或 <10。
 * @returns {boolean}
 */
export function isExtremeFate(talents) {
  return AXES.some((a) => talents[a] > 120 || talents[a] < 10);
}

// 以下三個門檻是「單高/雙高/單低」判定用的分界值。
// 總綱只明確定義了「極端」門檻,其餘四類(雙高/單低/單高/均衡)由設計者授權 Claude 決定,
// 依 150 三分、基準值 50 的分布抓一個直覺的分界:70 以上算「高」、30 以下算「低」。
// 如果實測後手感不對,只需要調這兩個常數,不用動下面的判定邏輯。
export const HIGH_THRESHOLD = 70;
export const LOW_THRESHOLD = 30;

/**
 * 命格七區間分類(§1.3),判定順序固定:極端→雙高→單低→單高→均衡,
 * 符合任一類即回傳,不再往下判。
 * @returns {{category: string, axis?: string}}
 *   category: "extreme" | "dual_high" | "single_low" | "single_high" | "balanced"
 *   axis: 僅 "single_low"/"single_high" 會附上是哪一軸(genggu/wuxing/yunqi)
 */
export function classifyFate(talents) {
  if (isExtremeFate(talents)) return { category: "extreme" };

  const highs = AXES.filter((a) => talents[a] >= HIGH_THRESHOLD);
  if (highs.length >= 2) return { category: "dual_high" };

  const lows = AXES.filter((a) => talents[a] <= LOW_THRESHOLD);
  if (lows.length === 1) return { category: "single_low", axis: lows[0] };

  if (highs.length === 1) return { category: "single_high", axis: highs[0] };

  return { category: "balanced" };
}

/** classifyFate() 的分類結果轉成 openingFateLines 的查表 key(single_high 依軸拆三份) */
function fateLineKey({ category, axis }) {
  return category === "single_high" ? `single_high_${axis}` : category;
}

/**
 * 開局命格文案(§1.3):依天賦分類抽一句意象文案。
 * @param {object} talents  state.talents(createCharacter 產出)
 * @param {object} quizData data/quiz.json(含 openingFateLines)
 * @param {Function} rng
 * @returns {{category:string, axis?:string, line:string}}
 */
export function openingFateLine(talents, quizData, rng = Math.random) {
  const classification = classifyFate(talents);
  const key = fateLineKey(classification);
  const pool = quizData.openingFateLines?.[key];
  if (!pool || pool.length === 0) throw new Error(`無命格文案:${key}`);
  const line = pool[Math.floor(rng() * pool.length)];
  return { ...classification, line };
}
