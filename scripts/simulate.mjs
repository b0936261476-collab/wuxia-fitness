// M8 蒙地卡羅平衡驗證(總綱 §10.4①)
// 三種極端命格 + 均衡對照組,各 × N 次 30 天週期,用真實引擎全程模擬:
// 每日運動(標準玩家錨點:≈30分跑步+輕肌力)、8000步→8事件、判定、資源、重生、勞務。
// 驗收(§10.5 M8):三種極端命格 30 天模擬皆「可玩且體感有別」。
//
// 用法:node scripts/simulate.mjs [每組次數,預設300]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  newState, logExercise, logSteps, startNextEvent, chooseOption, chooseSub,
  presentEvent, pendingEventCount, tickResourceRecovery, attemptRebirthCompletion, levels
} from "../src/engine/game.js";
import { allMax } from "../src/engine/resources.js";
import { recordTrialProgress } from "../src/engine/rebirth.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = Object.fromEntries(
  ["exercises", "events", "titles", "items", "tags", "quiz", "npcs", "reputation", "whispers", "narratives"]
    .map((n) => [n, loadJson(`data/${n}.json`)])
);

const RUNS = Number(process.argv[2]) || 300;
const DAYS = 30;

// 四種命格:三極端 + 均衡對照(§1.3 極端門檻 >120 / <10)
const FATES = {
  "極端根骨(132/9/9)": { genggu: 132, wuxing: 9, yunqi: 9 },
  "極端悟性(9/132/9)": { genggu: 9, wuxing: 132, yunqi: 9 },
  "極端運氣(9/9/132)": { genggu: 9, wuxing: 9, yunqi: 132 },
  "均衡對照(50/50/50)": { genggu: 50, wuxing: 50, yunqi: 50 }
};

function dateStr(dayIdx) {
  const d = new Date(Date.UTC(2026, 8, 1 + dayIdx)); // 模擬起點 2026-09-01
  return d.toISOString().slice(0, 10);
}

/** 標準玩家的一天練功:30分跑步 + 30下深蹲(日均經驗≈3000×悟性倍率,對照 §9.7.2 錨點) */
function trainDaily(state, date) {
  logExercise(state, data, "paobu", 30, date);
  logExercise(state, data, "shendun", 30, date);
}

/** 重生中:玩家會照六大試煉練(模擬直接灌滿進度,再嘗試完成) */
function grindRebirth(state, date) {
  for (const [ex, amt] of [["paobu", 30], ["yujia", 30], ["fudi", 100], ["yangwoqizuo", 100], ["shendun", 100], ["jiaohudentiao", 100]]) {
    try { recordTrialProgress(state.rebirth.progress, ex, amt); } catch { /* 動作id若不同,靠下面補滿 */ }
  }
  // 保險:直接把試煉進度全數補滿(模擬玩家花一天完成)
  for (const key of Object.keys(state.rebirth.progress)) {
    state.rebirth.progress[key] = 99999;
  }
  attemptRebirthCompletion(state, date);
}

function simulateOne(talents) {
  const s = newState();
  s.talents = { ...talents };
  const max = allMax(s.talents.genggu, levels(s));
  s.resources = { hp: max.hp, qi: max.qi, tili: max.tili };

  const m = {
    judged: 0, success: 0, events: 0, rebirths: 0, whispers: 0,
    tiliExhaustedDays: 0, laborStarted: 0, errors: 0
  };

  for (let day = 0; day < DAYS; day++) {
    const date = dateStr(day);
    tickResourceRecovery(s, 24, date); // 隔夜自然恢復
    if (s.rebirth) { m.rebirths++; grindRebirth(s, date); continue; } // 重生日:專心試煉
    trainDaily(s, date);
    // 每日一次,不會重複;真出錯要炸出來,不能吞——2026-08-21 就是被吞掉的
    // 例外讓整個模擬悄悄少算了三十天的步數,報表卻照樣印得漂漂亮亮。
    logSteps(s, data, 8000, date);

    let guard = 0;
    while (pendingEventCount(s) > 0 && !s.rebirth && guard++ < 20) {
      const ev = startNextEvent(s, data, date, Math.random);
      if (!ev) break; // 池子全冷卻:今天沒事發生
      if (s.pendingEvent?.whisper) m.whispers++;
      try {
        const view = presentEvent(s, data);
        let res;
        if (view.immediate || !view.choices.length) {
          res = chooseOption(s, data, null, date, Math.random);
        } else {
          const pick = view.choices[Math.floor(Math.random() * view.choices.length)];
          res = chooseOption(s, data, pick.id, date, Math.random);
        }
        if (!res.done) {
          const sub = presentEvent(s, data);
          const pick = sub.choices[Math.floor(Math.random() * sub.choices.length)];
          res = chooseSub(s, data, pick.id, date, Math.random);
        }
        m.events++;
        if (res.entry.success != null) {
          m.judged++;
          if (res.entry.success) m.success++;
        }
      } catch (e) {
        m.errors++;
        s.pendingEvent = null; // 模擬器不因單一事件炸掉整輪
      }
    }
    if (s.labor?.active) m.laborStarted = 1;
    const curMax = allMax(s.talents.genggu, levels(s));
    if (s.resources.tili <= 0 || s.resources.tili / curMax.tili < 0.05) m.tiliExhaustedDays++;
  }

  const lv = levels(s);
  m.levelSum = Object.values(lv).reduce((a, b) => a + b, 0);
  m.fame = s.reputation.fame;
  m.flags = Object.keys(s.flags).length;
  return m;
}

function avg(arr, key) {
  return arr.reduce((a, x) => a + x[key], 0) / arr.length;
}

console.log(`M8 蒙地卡羅:${Object.keys(FATES).length} 命格 × ${RUNS} 次 × ${DAYS} 天\n`);
const summary = {};
for (const [name, talents] of Object.entries(FATES)) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(simulateOne(talents));
  summary[name] = {
    "六維總和(30天)": avg(runs, "levelSum").toFixed(1),
    "事件數/30天": avg(runs, "events").toFixed(1),
    "判定成功率": (avg(runs, "success") / Math.max(1, avg(runs, "judged")) * 100).toFixed(1) + "%",
    "重生次數": avg(runs, "rebirths").toFixed(2),
    "耳語次數": avg(runs, "whispers").toFixed(2),
    "體力見底天數": avg(runs, "tiliExhaustedDays").toFixed(2),
    "俠名": avg(runs, "fame").toFixed(1),
    "flag數": avg(runs, "flags").toFixed(1),
    "引擎錯誤": runs.reduce((a, x) => a + x.errors, 0)
  };
}
console.table(summary);

// 驗收判定
const rows = Object.values(summary);
const errors = rows.reduce((a, r) => a + r["引擎錯誤"], 0);
console.log(errors === 0 ? "✅ 全程零引擎錯誤(可玩)" : `❌ 引擎錯誤 ${errors} 次`);
