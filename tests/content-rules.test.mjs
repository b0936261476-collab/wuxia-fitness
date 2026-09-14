// 設計者對內容下過的規則,凡是能從資料上檢查的,都寫成測試,之後新寫的事件也逃不掉。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { newState } from "../src/engine/game.js";
import { eligibleEvents } from "../src/engine/events2.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const events = J("data/events.json");
const map = J("data/map.json");
const pool = events.pool;

/** 事件庫裡任何一條路發得出來的旗標 */
function grantableFlags() {
  const set = new Set(Array.from({ length: 100 }, (_, i) => `surpassed_${i + 1}`)); // 引擎寫的名次旗標
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (k === "setFlags" && Array.isArray(v)) v.forEach((f) => set.add(f));
      else walk(v);
    }
  })(pool);
  return set;
}

test("收線:forbidFlags 引用的旗標都發得出來(寫錯字的話,該收的事件會一直出現)", () => {
  const ok = grantableFlags();
  const bad = [];
  for (const ev of pool) {
    for (const group of ev.conditions?.forbidFlags ?? []) {
      for (const f of group.split("|")) if (!ok.has(f)) bad.push(`${ev.eventId}:${f}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("收線:兒子回家以後,渡口不會再有人抱著食盒等船", {
  todo: "等 Codex 實作 conditions.forbidFlags(需求見 AGENTS.md);實作後拿掉這個 todo"
}, () => {
  const data = { events, map };
  const s = newState();
  s.travel = { at: "dukou" };
  const inPool = () => eligibleEvents(s, data, "2026-09-15").some((c) => c.ev.eventId === "ZY-003_ferry_wait");
  assert.ok(inPool(), "前提:還沒收線時,等船的人在池子裡");
  s.flags.cheng_home_told = true;
  assert.ok(!inPool(), "收線之後不該再抽到她");
});

/** 一件事件所有「結果」段落:選項結果、成敗、察覺加段、出名版本、輾壓版、無選項事件的結尾 */
function outcomes(ev) {
  const out = [];
  const he = ev.beats?.he ?? {};
  for (const [id, v] of Object.entries(he.byChoice ?? {})) {
    if (v.text) out.push({ where: id, ...v });
    if (v.success) out.push({ where: `${id} 成功`, ...v.success });
    if (v.fail) out.push({ where: `${id} 失敗`, ...v.fail });
    if (v.perceivedExtra) out.push({ where: `${id} 察覺加段`, ...v.perceivedExtra, inherits: v });
    for (const f of Object.values(v.fameVariants ?? {})) out.push({ where: `${id} 出名版`, ...f, inherits: v });
  }
  if (he.text) out.push({ where: "結尾", ...he });
  if (ev.variants?.crush) out.push({ where: "輾壓版", ...ev.variants.crush });
  return out;
}

// 「教你」「在旁邊指點」這類寫法=有人把本事交到玩家手上。玩家教別人、別人教第三人不算。
const TAUGHT_YOU = /教了?你|指點你|在旁邊[^。」]{0,6}指點|拉著你講|手把手/;
// 例外要寫理由:只是回頭提起「以前教過」,經驗在當初那一次已經給過
const NOT_NEW_LESSON = new Set([
  "FO-001_cliff_herb D" // 「正是當日教你順口溜的那個」——順口溜在〈採藥老漢〉那次教、那次給經驗
]);

test("別人教了你東西,結算就要真的給經驗(設計者 2026-09-15:「他教了東西就要真的有經驗」)", () => {
  const bad = [];
  for (const ev of pool) {
    for (const o of outcomes(ev)) {
      if (!TAUGHT_YOU.test(o.text ?? "")) continue;
      if (NOT_NEW_LESSON.has(`${ev.eventId} ${o.where}`)) continue;
      // 察覺加段、出名版會疊在原結果上結算,原結果給了經驗就算數
      const exp = o.effects?.expGrant ?? o.inherits?.effects?.expGrant;
      if (!exp || !Object.keys(exp).length) bad.push(`${ev.eventId}〈${ev.title}〉${o.where}`);
    }
  }
  assert.deepEqual(bad, [], "這些結果寫了有人教你,卻沒給經驗");
});
