// M8 疊加壓力測試(總綱 §10.4②)
// 窮舉最有利標籤組合 × 極端命格 × 高六維 × 滿階稱號加成,驗證防爆三保險:
// ①同族取最高 ②標籤修正總和封頂±50% ③最終成功率夾 5%~95%。
// 驗收(§10.5 M8):疊加壓測無突破 95% 上限案例;另掃全事件庫實際判定點。
//
// 用法:node scripts/stresstest.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { successRateV2, aggregateTagModifiers, tagContribution } from "../src/engine/tags.js";
import { newState, levels } from "../src/engine/game.js";
import { optionSuccessRate, perceptionCheck, eventById } from "../src/engine/events2.js";
import { thresholdForLevel } from "../src/engine/exp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = Object.fromEntries(
  ["exercises", "events", "titles", "items", "tags", "quiz", "npcs", "reputation"]
    .map((n) => [n, loadJson(`data/${n}.json`)])
);

let failures = 0;
const check = (cond, msg) => {
  if (cond) { console.log(`  ✅ ${msg}`); }
  else { failures++; console.log(`  ❌ ${msg}`); }
};

// ---------- ① 理論最有利疊加:全標籤 + 極端天賦 + 滿階稱號 ----------

console.log("① 標籤修正封頂(保險②:±50%)");
const maxCtx = {
  talents: { genggu: 140, wuxing: 140, yunqi: 140 }, // 理論上限外的極端值(總和150其實不可能三者皆140,取更嚴苛的假想值)
  eventCategory: "yunqi_event",                       // 運氣事件:天賦係數最大檔(×1.0)
  sixdimLevels: { light: 110, inner: 110, hard: 110, soft: 110, eye: 110, ear: 110 },
  resourcePercents: { hp: 1, qi: 1, tili: 1 },
  titleTiers: { light: 6, inner: 6, hard: 6, soft: 6, eye: 6, ear: 6 }, // 六維全滿階
  balancedTier: 6
};
const allTags = Object.keys(data.tags.tagRegistry);
const totalMod = aggregateTagModifiers(allTags, maxCtx, data.tags);
console.log(`  全 ${allTags.length} 標籤同掛、極端命格、六維110、滿階稱號 → 總修正 = ${(totalMod * 100).toFixed(1)}%`);
check(totalMod <= 0.5 + 1e-9, "總修正 ≤ +50%(保險②生效)");

// 同族取最高(保險①):單掛運氣標籤 vs 疊三個天賦標籤,結果應相同
const single = aggregateTagModifiers(["yunqi_rel"], maxCtx, data.tags);
const tripled = aggregateTagModifiers(["yunqi_rel", "genggu_rel", "wuxing_rel"], maxCtx, data.tags);
check(Math.abs(single - tripled) < 1e-9, `同族多標籤只取最高(單掛 ${(single * 100).toFixed(1)}% = 疊三 ${(tripled * 100).toFixed(1)}%,保險①生效)`);

// ---------- ② 最終成功率封頂(保險③:5%~95%) ----------

console.log("\n② 最終成功率夾擠");
const god = successRateV2({ relevantLevel: 110, benchmarkLevel: 1, tagList: allTags, ctx: maxCtx, tagsData: data.tags });
check(god <= 0.95, `六維110 打 benchmark 1 + 滿疊加 → ${(god * 100).toFixed(1)}%(≤95%,永留翻車空間)`);
const worst = successRateV2({ relevantLevel: 0, benchmarkLevel: 80, tagList: [], ctx: {}, tagsData: data.tags });
check(worst >= 0.05, `六維0 打 benchmark 80 → ${(worst * 100).toFixed(1)}%(≥5%,永留奇蹟空間)`);

// ---------- ③ 全事件庫實掃:每個判定選項在神級狀態下不破 95% ----------

console.log("\n③ 全事件庫判定點實掃(神級玩家)");
const godState = newState();
godState.talents = { genggu: 140, wuxing: 140, yunqi: 140 };
for (const dim of Object.keys(godState.exp)) godState.exp[dim] = thresholdForLevel(110);
const maxResources = { hp: 999999, qi: 999999, tili: 999999 };
godState.resources = maxResources;

let judgedOptions = 0, over95 = 0, under5 = 0;
const brokeState = newState(); // 白板玩家(六維0、無天賦)
for (const ev of data.events.pool) {
  for (const opt of ev.beats.cheng.choices || []) {
    if (!opt.judge) continue;
    judgedOptions++;
    const hi = optionSuccessRate(godState, data, ev, opt);
    const lo = optionSuccessRate(brokeState, data, ev, opt);
    if (hi > 0.95 + 1e-9) { over95++; console.log(`  ❌ ${ev.eventId}/${opt.id} 神級 ${(hi * 100).toFixed(1)}%`); }
    if (lo < 0.05 - 1e-9) { under5++; console.log(`  ❌ ${ev.eventId}/${opt.id} 白板 ${(lo * 100).toFixed(1)}%`); }
  }
}
check(over95 === 0, `${judgedOptions} 個判定選項,神級玩家全數 ≤95%`);
check(under5 === 0, `${judgedOptions} 個判定選項,白板玩家全數 ≥5%`);

// ---------- ④ 察覺判定邊界(§9.11.1:必見/必盲不擲,中間夾 5–95%) ----------

console.log("\n④ 察覺判定邊界");
let percOk = true;
for (const ev of data.events.pool) {
  if (!ev.perception) continue;
  const c = ev.perception.concealment;
  const dim = { qinggong: "light", neigong: "inner", yinggong: "hard", ruangong: "soft", yangong: "eye", ergong: "ear" }[ev.perception.tag];
  const mk = (lv) => { const s = newState(); s.exp[dim] = thresholdForLevel(lv); return s; };
  // 必見:等級 = 2×隱蔽度,rng 回 0.9999 也必見
  if (!perceptionCheck(mk(c * 2), data, ev, () => 0.9999).seen) { percOk = false; console.log(`  ❌ ${ev.eventId} 必見邊界失效`); }
  // 必盲:等級 < 隱蔽度/2,rng 回 0.0001 也必盲
  const blindLv = Math.max(0, Math.ceil(c / 2) - 1);
  if (blindLv < c / 2 && perceptionCheck(mk(blindLv), data, ev, () => 0.0001).seen) { percOk = false; console.log(`  ❌ ${ev.eventId} 必盲邊界失效`); }
}
check(percOk, "全事件察覺「必見/必盲」邊界正確(高手不用擲、井蛙擲了也沒用)");

console.log("\n" + (failures === 0 ? "🎉 疊加壓測全數通過:防爆三保險逐層生效,無突破 95% 案例" : `⚠️ ${failures} 項未過,需校準`));
process.exit(failures === 0 ? 0 : 1);
