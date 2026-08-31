// 內容耗盡模擬:標準玩家連玩 N 天,逐日統計「今天遇到的事,有幾件是頭一次見」。
// 回答設計者的問題:事件多久會少到無趣?事件庫要不要繼續擴充?
// 用法:node scripts/contentsim.mjs [天數=180] [場數=200]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  newState, startNextEvent, presentEvent, chooseOption, chooseSub,
  logExercise, logSteps, pendingEventCount, tickResourceRecovery, levels
} from "../src/engine/game.js";
import { allMax } from "../src/engine/resources.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = Object.fromEntries(
  ["exercises", "events", "titles", "items", "tags", "quiz", "npcs", "reputation", "whispers", "narratives", "jianghu_news", "map"]
    .map((n) => [n, loadJson(`data/${n}.json`)])
);

const DAYS = Number(process.argv[2]) || 180;
const RUNS = Number(process.argv[3]) || 200;

const dateStr = (i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);

function simulateOne() {
  const s = newState();
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  const max = allMax(50, levels(s));
  s.resources = { hp: max.hp, qi: max.qi, tili: max.tili };

  const seen = new Set();
  const perDay = []; // {events, fresh}
  for (let day = 0; day < DAYS; day++) {
    const date = dateStr(day);
    tickResourceRecovery(s, 24, date);
    if (s.rebirth) { for (const k of Object.keys(s.rebirth.progress)) s.rebirth.progress[k] = 99999; }
    logExercise(s, data, "paobu", 30, date);
    logSteps(s, data, 8000, date);

    let events = 0, fresh = 0, guard = 0;
    while (pendingEventCount(s) > 0 && !s.rebirth && guard++ < 20) {
      const ev = startNextEvent(s, data, date, Math.random);
      if (!ev) break;
      events++;
      if (!seen.has(ev.id)) { fresh++; seen.add(ev.id); }
      const view = presentEvent(s, data);
      let res;
      if (view.immediate || !view.choices.length) res = chooseOption(s, data, null, date, Math.random);
      else res = chooseOption(s, data, view.choices[Math.floor(Math.random() * view.choices.length)].id, date, Math.random);
      if (!res.done) {
        const sub = presentEvent(s, data);
        res = chooseSub(s, data, sub.choices[Math.floor(Math.random() * sub.choices.length)].id, date, Math.random);
      }
    }
    perDay.push({ events, fresh, distinct: seen.size });
  }
  return perDay;
}

// ---------- 跑 ----------

const total = data.events.pool.filter((e) => !e.triggerOnly).length;
console.log(`內容耗盡模擬:標準玩家(日走 8000 步+跑步 30 分 ≈ 每天 10 件事)× ${RUNS} 場 × ${DAYS} 天`);
console.log(`可抽事件總數:${total} 件\n`);

const agg = Array.from({ length: DAYS }, () => ({ events: 0, fresh: 0, distinct: 0 }));
for (let r = 0; r < RUNS; r++) {
  const perDay = simulateOne();
  for (let d = 0; d < DAYS; d++) {
    agg[d].events += perDay[d].events;
    agg[d].fresh += perDay[d].fresh;
    agg[d].distinct += perDay[d].distinct;
  }
}

// 七日滑動窗的新鮮率:當週遇到的事裡,幾成是頭一次見
const freshRate = (d) => {
  const lo = Math.max(0, d - 6);
  let f = 0, e = 0;
  for (let i = lo; i <= d; i++) { f += agg[i].fresh; e += agg[i].events; }
  return e ? f / e : 0;
};

const firstDayBelow = (th) => {
  for (let d = 7; d < DAYS; d++) if (freshRate(d) < th) return d + 1;
  return null;
};

const rows = [];
for (const d of [7, 14, 21, 30, 45, 60, 90, 120, 150, 180]) {
  if (d > DAYS) break;
  rows.push({
    第幾天: d,
    "當週新鮮率": (freshRate(d - 1) * 100).toFixed(0) + "%",
    "已見過幾件": (agg[d - 1].distinct / RUNS).toFixed(0) + ` / ${total}`
  });
}
console.table(rows);

const d50 = firstDayBelow(0.5), d20 = firstDayBelow(0.2), d5 = firstDayBelow(0.05);
console.log(`新鮮率跌破五成:第 ${d50 ?? "180+"} 天`);
console.log(`新鮮率跌破兩成:第 ${d20 ?? "180+"} 天  ← 開始覺得「都見過」的體感線`);
console.log(`新鮮率跌破半成:第 ${d5 ?? "180+"} 天  ← 幾乎全是重播的無趣線`);

// 穩態重播間隔:末 30 天,平均每件可重複事件多久輪一次
const tail = agg.slice(-30);
const tailEvents = tail.reduce((a, x) => a + x.events, 0) / RUNS / 30;
const repeatables = data.events.pool.filter((e) => !e.triggerOnly && (e.cooldown ?? 0) < 999).length;
console.log(`\n穩態(末 30 天):每天約 ${tailEvents.toFixed(1)} 件事,可重複池 ${repeatables} 件`);
console.log(`→ 同一件事平均每 ${(repeatables / tailEvents).toFixed(1)} 天重播一次(冷卻與地域加權會讓實際體感更集中)`);
