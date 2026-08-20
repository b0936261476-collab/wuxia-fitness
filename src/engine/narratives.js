// 敘事播放判定(v2 總綱 §4 狀態敘事 / §8.7 監使頒號)
// 純邏輯、無 DOM:只判斷「這一刻該不該播、播哪一段」,文案本體在 data/narratives.json。
//
// 兩條規則:
//   狀態敘事 —— 檔位「惡化」時播一次(無→輕、無→重、輕→重);好轉時靜默,
//               但把檔位記回去,所以再次掉下來會再播。
//   監使頒號 —— 某一維第一次解鎖武道里程碑(Lv.10)時播一次,終身一次。

import { DIMENSIONS } from "./exp.js";
import { hpTier, qiTier, tiliTier } from "./resources.js";

const RESOURCE_KEYS = ["hp", "qi", "tili"];
const TIER_FN = { hp: hpTier, qi: qiTier, tili: tiliTier };
const TIER_SEVERITY = { light: 1, heavy: 2 };

const severity = (tier) => (tier == null ? 0 : TIER_SEVERITY[tier]);

/** 播放紀錄的初始值(newState 與舊存檔遷移共用同一份) */
export function newNarrativeRecord() {
  return { states: { hp: null, qi: null, tili: null }, bestow: {} };
}

export function ensureNarrativeState(state) {
  if (!state.narrative) state.narrative = newNarrativeRecord();
  if (!state.narrative.states) state.narrative.states = newNarrativeRecord().states;
  if (!state.narrative.bestow) state.narrative.bestow = {};
  return state.narrative;
}

/**
 * 舊存檔接線用:把「當下的狀態」直接記為已播過。
 * 沒有這一步,一個早就重傷、六維早就過 Lv.10 的舊存檔會在載入瞬間倒出一整疊回溯敘事。
 */
export function primeNarrativeState(state, percents) {
  const rec = ensureNarrativeState(state);
  if (percents) {
    for (const key of RESOURCE_KEYS) rec.states[key] = TIER_FN[key](percents[key]);
  }
  for (const dim of DIMENSIONS) {
    if ((state.milestones?.[dim] ?? -1) >= 0) rec.bestow[dim] = true;
  }
  return rec;
}

/**
 * 狀態惡化敘事(§4 四段式:覺→察→省→變)。
 * @param {object} percents resourcePercents(state) 的結果;創角前為 null
 */
export function collectStateNarratives(state, data, percents) {
  const rec = ensureNarrativeState(state);
  if (!percents) return [];
  const out = [];
  for (const key of RESOURCE_KEYS) {
    const tier = TIER_FN[key](percents[key]);
    if (severity(tier) > severity(rec.states[key])) {
      const src = data.narratives?.states?.[`${key}_${tier}`];
      if (src) {
        out.push({
          kind: "state",
          key: `${key}_${tier}`,
          name: src.name,
          beats: [src.jue, src.cha, src.xing, src.bian]
        });
      }
    }
    rec.states[key] = tier;
  }
  return out;
}

/** 監使頒號(§8.7 四段式:起→承→轉→合),每維終身一次 */
export function collectBestowNarratives(state, data) {
  const rec = ensureNarrativeState(state);
  const out = [];
  for (const dim of DIMENSIONS) {
    if ((state.milestones?.[dim] ?? -1) < 0) continue;
    if (rec.bestow[dim]) continue;
    rec.bestow[dim] = true;
    const src = data.narratives?.titleBestow?.[dim];
    if (src) {
      out.push({
        kind: "bestow",
        key: dim,
        name: src.title,
        beats: [src.qi, src.cheng, src.zhuan, src.he]
      });
    }
  }
  return out;
}

/** 一次收齊待播敘事:頒號在前(喜事先報),狀態在後 */
export function collectNarratives(state, data, percents) {
  return [
    ...collectBestowNarratives(state, data),
    ...collectStateNarratives(state, data, percents)
  ];
}
