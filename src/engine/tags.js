// 標籤判定引擎(v2 總綱 第零章 §0.3/§0.4)
// 全遊戲唯一判定公式:
//   最終成功率 = 50% + (玩家相關等級 − 事件基準等級) × 3% + Σ(各標籤族修正)
//   標籤修正總和夾在 ±50%;最終成功率夾在 5%~95%
// 疊加防爆三保險:①同族取最高 ②總修正封頂±50% ③成長入口冷卻(不在此模組,屬經驗/成長邏輯)
// 純函數、無 DOM、無 state 副作用,方便單元測試(§10.5 M2 驗收要求)。

/**
 * 計算單一標籤的修正值(fraction,例如 0.02 代表 +2 個百分點)。
 * @param {string} tagId        標籤 id(對照 tags.json 的 tagRegistry)
 * @param {object} ctx          該次判定的上下文,依標籤族取用不同欄位:
 *                                 talent:  { talents: {genggu, wuxing, yunqi}, eventCategory }
 *                                 sixdim:  { sixdimLevels: {light, inner, hard, soft, eye, ear} }
 *                                 resource:{ resourcePercents: {...}, debuffTables: {hp:[...], qi:[...], tili:[...]} }
 *                                 martial: 二期系統,恆回 0
 * @param {object} tagsData     data/tags.json 內容
 * @returns {number} 修正值(fraction)
 */
export function tagContribution(tagId, ctx, tagsData) {
  const def = tagsData.tagRegistry[tagId];
  if (!def) throw new Error(`未知標籤:${tagId}`);

  switch (def.family) {
    case "talent":
      return talentContribution(def, ctx);
    case "sixdim":
      return sixdimContribution(def, ctx);
    case "resource":
      return resourceContribution(def, ctx);
    case "martial":
      return 0; // 二期系統,formula 待定(tags.json 標記 "tbd")
    case "title":
      return titleContribution(def, ctx);
    default:
      throw new Error(`未知標籤族:${def.family}`);
  }
}

/** 天賦族:(v−50) × coef,coef 依事件情境查表(§0.1、§1.4) */
function talentContribution(def, ctx) {
  const talentKey = def.source.split(".")[1]; // "talent.genggu" → "genggu"
  const value = ctx?.talents?.[talentKey];
  if (value == null) return 0; // 天賦系統未上線(M3 前)或此判定無天賦資料時視為無修正
  const coef = def.coef?.[ctx.eventCategory];
  if (coef == null) return 0; // 情境未對應到係數表,不猜測、回 0
  return (value - 50) * coef;
}

/** 六維族:√等級 × 4(百分點),統一換算為 fraction(§0.1) */
function sixdimContribution(def, ctx) {
  const dimKey = def.source.split(".")[1]; // "sixdim.light.level" → "light"
  const level = ctx?.sixdimLevels?.[dimKey];
  if (level == null) return 0;
  return (Math.sqrt(Math.max(0, level)) * 4) / 100;
}

/** 資源族:依 DEBUFF 表觸發修正(§4章)。ctx.debuffTables 依資源分開(如 {hp:[...], qi:[...], tili:[...]})。 */
function resourceContribution(def, ctx) {
  const resKey = def.source.split(".")[0]; // "hp.percent" → "hp"
  const percent = ctx?.resourcePercents?.[resKey];
  const table = ctx?.debuffTables?.[resKey];
  if (percent == null || !table) return 0;
  // debuffTable 格式:[{ belowPercent, familyMod }, ...],採嚴格 "<"(§4 DEBUFF 閾值語意)
  let mod = 0;
  for (const row of table) {
    if (percent < row.belowPercent) mod = row.familyMod;
  }
  return mod;
}

/**
 * 稱號族:輕加成(§8.4)=階數×0.5%。source 兩種形式:
 *   "titleTiers.<dim>" → 讀 ctx.titleTiers[dim](武道里程碑,per-dim)
 *   "balancedTier"      → 讀 ctx.balancedTier(均衡里程碑,全域)
 * tier 為 1 起算的階數(0 或未提供視為未解鎖,不產生加成)。
 */
function titleContribution(def, ctx) {
  const parts = def.source.split(".");
  const tier = parts.length === 2 ? ctx?.titleTiers?.[parts[1]] : ctx?.[parts[0]];
  if (!tier) return 0;
  return tier * 0.005;
}

/**
 * 疊加防爆保險①②:同族取最高、總修正封頂 ±50%。
 * @param {Array<{id: string, ctx?: object}>} tagList  本次判定涉及的標籤,可各自帶專屬 ctx 覆蓋預設 ctx
 * @param {object} defaultCtx   套用到未指定 ctx 的標籤
 * @param {object} tagsData
 * @returns {number} 封頂後的標籤修正總和(fraction,已夾在 ±0.5)
 */
export function aggregateTagModifiers(tagList, defaultCtx, tagsData) {
  const byFamily = {};
  for (const t of tagList) {
    const tagId = typeof t === "string" ? t : t.id;
    const ctx = typeof t === "string" ? defaultCtx : { ...defaultCtx, ...t.ctx };
    const def = tagsData.tagRegistry[tagId];
    if (!def) throw new Error(`未知標籤:${tagId}`);
    const value = tagContribution(tagId, ctx, tagsData);
    if (!(def.family in byFamily) || value > byFamily[def.family]) {
      byFamily[def.family] = value; // 保險①:同族取最高
    }
  }
  const total = Object.values(byFamily).reduce((a, b) => a + b, 0);
  return clamp(total, -0.5, 0.5); // 保險②:總修正封頂 ±50%
}

/**
 * 全遊戲唯一判定公式(§0.3)。
 * @param {object} params
 * @param {number} params.relevantLevel  玩家相關等級(判定當下的數值)
 * @param {number} params.benchmarkLevel 事件/對手基準等級
 * @param {Array}  params.tagList        涉及標籤(見 aggregateTagModifiers)
 * @param {object} params.ctx            預設判定上下文
 * @param {object} params.tagsData       data/tags.json
 * @returns {number} 成功率(fraction,已夾在 5%~95%)
 */
export function successRateV2({ relevantLevel, benchmarkLevel, tagList = [], ctx = {}, tagsData }) {
  const base = 0.5 + (relevantLevel - benchmarkLevel) * 0.03;
  const tagMod = aggregateTagModifiers(tagList, ctx, tagsData);
  return clamp(base + tagMod, 0.05, 0.95);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
