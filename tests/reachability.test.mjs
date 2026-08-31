// 內容可達性稽核(2026-08-31 新增)
//
// 起因:`perceivedExtra.setFlags` 被引擎漏讀,害得「打鐵鋪看見劍坯」的旗標永遠不亮,
// 整條劍線三響在實際遊玩中觸發不了——而所有既有測試都沒發現,因為它們手動設旗標。
//
// 這份測試守的是「資料寫了、引擎卻沒接」這一整類漏洞:
//   ① 每個被當條件用的旗標,都要有某條路發得出來(沒有死路內容)
//   ② setFlags 只能掛在引擎真的會讀的位置(下面那張白名單就是引擎現況)
//   ③ 事件引用的別的事件 id、道具 id、NPC 名,都要真的存在

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const events = loadJson("data/events.json");
const items = loadJson("data/items.json");
const npcs = loadJson("data/npcs.json");
const map = loadJson("data/map.json");

/**
 * 引擎真的會套用 setFlags 的位置——**直接從 events2.js 原始碼推導,不手抄**。
 * 手抄的白名單會跟引擎脫鉤:寫進資料檔卻沒接引擎的旗標,靜悄悄地永遠不亮
 * (2026-08-31 的 perceivedExtra 就是這樣溜過去的)。
 *
 * 對應關係:程式碼裡的 `X.setFlags`,X 就是資料檔裡的宿主鍵;
 * 兩個靠變數轉手的例外在下面明寫。
 */
const ENGINE_SRC = readFileSync(join(root, "src/engine/events2.js"), "utf8");
const VAR_TO_HOST = {
  opt: "choices",           // chooseOptionV2 的 opt = beats.cheng.choices[]
  ep: "extraPerception",    // finalize 的 ep = outcome.extraPerception
  effects: "effects"
};
function engineSetFlagHosts() {
  const hosts = new Set();
  for (const m of ENGINE_SRC.matchAll(/(?:^|[\s(!])([A-Za-z_$][\w$.]*)\.setFlags/g)) {
    const expr = m[1];
    const last = expr.split(".").pop();          // ev.perception → perception
    hosts.add(VAR_TO_HOST[last] ?? VAR_TO_HOST[expr] ?? last);
  }
  hosts.delete("state"); // setFlags(state, …) 的定義本身,不是宿主
  return hosts;
}
const SETFLAG_HOSTS = engineSetFlagHosts();

test("可達性:引擎讀得到的 setFlags 位置至少涵蓋這幾個關鍵處(防退化)", () => {
  for (const must of ["choices", "perception", "effects", "perceivedExtra", "crushExtra", "extraPerception"]) {
    assert.ok(SETFLAG_HOSTS.has(must), `引擎不再讀 ${must}.setFlags——這會讓一整批內容靜默失效`);
  }
});

/** 走訪整棵事件樹,回報每個 setFlags 出現的「宿主鍵」 */
function collectSetFlags(node, hostKey, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectSetFlags(v, hostKey, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.setFlags)) out.push({ host: hostKey, flags: node.setFlags });
  for (const [k, v] of Object.entries(node)) {
    if (k === "setFlags") continue;
    // 陣列的宿主鍵沿用陣列本身的鍵名(choices[] 的每個元素宿主仍是 choices)
    collectSetFlags(v, Array.isArray(v) ? k : (typeof v === "object" ? k : hostKey), out);
  }
}

test("可達性:setFlags 只出現在引擎真的會讀的位置", () => {
  const bad = [];
  for (const ev of events.pool) {
    const found = [];
    collectSetFlags(ev, "root", found);
    for (const f of found) {
      if (!SETFLAG_HOSTS.has(f.host)) bad.push(`${ev.eventId}:${f.host} → ${f.flags.join(",")}`);
    }
  }
  assert.deepEqual(bad, [], `這些旗標掛在引擎不會讀的位置,寫了也不會生效:\n${bad.join("\n")}`);
});

test("可達性:每個被當條件用的旗標,都有某條路發得出來(無死路內容)", () => {
  const grantable = new Set();
  for (const ev of events.pool) {
    const found = [];
    collectSetFlags(ev, "root", found);
    for (const f of found) for (const flag of f.flags) grantable.add(flag);
  }

  const required = new Map(); // flag → 誰要用它
  const need = (flag, who) => {
    if (!required.has(flag)) required.set(flag, []);
    required.get(flag).push(who);
  };
  for (const ev of events.pool) {
    const c = ev.conditions ?? {};
    for (const r of c.requireFlags ?? []) for (const alt of r.split("|")) need(alt, ev.eventId);
    for (const k of Object.keys(c.minDaysSince ?? {})) if (k.startsWith("flag:")) need(k.slice(5), ev.eventId);
    for (const ch of ev.beats.cheng.choices ?? []) {
      if (ch.requireFlag) for (const alt of ch.requireFlag.split("|")) need(alt, `${ev.eventId}:${ch.id}`);
    }
  }
  // 輿圖的繞路旗標也是條件的一種
  for (const p of map.provinces ?? []) if (p.detour?.flag) need(p.detour.flag, `map:${p.id}`);

  const dead = [...required.entries()].filter(([f]) => !grantable.has(f));
  assert.deepEqual(dead.map(([f, who]) => `${f}(${who.join("/")})`), [],
    "這些旗標沒有任何事件發得出來,靠它開門的內容是死路");
});

test("可達性:minDaysSince 引用的事件 id 真的存在", () => {
  const ids = new Set(events.pool.map((e) => e.eventId));
  const bad = [];
  for (const ev of events.pool) {
    for (const k of Object.keys(ev.conditions?.minDaysSince ?? {})) {
      if (!k.startsWith("flag:") && !ids.has(k)) bad.push(`${ev.eventId} 引用了不存在的事件 ${k}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("可達性:itemGrant 的道具、npcBind 的人、mapGrant 的州都存在", () => {
  const itemIds = new Set(items.items.map((i) => i.id));
  const npcNames = new Set(npcs.top100.map((n) => n.name));
  const provinceIds = new Set((map.provinces ?? []).map((p) => p.id));
  const bad = [];
  const scan = (node, evId) => {
    if (Array.isArray(node)) { for (const v of node) scan(v, evId); return; }
    if (!node || typeof node !== "object") return;
    if (node.itemGrant) {
      for (const id of Object.keys(node.itemGrant)) if (!itemIds.has(id)) bad.push(`${evId} 發了不存在的道具 ${id}`);
    }
    if (typeof node.mapGrant === "string" && !provinceIds.has(node.mapGrant)) {
      bad.push(`${evId} 發了不存在的輿圖 ${node.mapGrant}`);
    }
    for (const v of Object.values(node)) scan(v, evId);
  };
  for (const ev of events.pool) {
    if (ev.npcBind && !npcNames.has(ev.npcBind)) bad.push(`${ev.eventId} 綁了不在百強名冊的 ${ev.npcBind}`);
    scan(ev, ev.eventId);
  }
  assert.deepEqual(bad, []);
});

test("可達性:察覺型選項的事件必須有 perception 區塊(否則選項永不出現)", () => {
  const bad = [];
  for (const ev of events.pool) {
    const needsPerception = (ev.beats.cheng.choices ?? []).some((c) => c.requirePerception);
    const needsCrush = (ev.beats.cheng.choices ?? []).some((c) => c.requireCrush);
    if (needsPerception && !ev.perception) bad.push(`${ev.eventId} 有察覺選項卻沒有 perception`);
    if (needsCrush && !ev.perception?.crushReveal) bad.push(`${ev.eventId} 有輾壓選項卻沒有 crushReveal`);
  }
  assert.deepEqual(bad, []);
});

test("可達性:再遇鐵律——可重複且有固定人物的事件要有再遇版", () => {
  // 例外:每次是不同人、或神祕留白型(每次都像初見才對味)
  const EXEMPT = new Set([
    "DA-003_rain_shelter", "CH-002_street_duel", "DU-002_wandering_staff",
    "FO-001_cliff_herb", "FO-002_night_flute", "CH-005_landslide",
    "FO-003_mist_lantern", "FO-004_night_fishfire", "CH-008_lost_child",
    "DA-012_rain_pavilion", "DU-006_runaway_mule", "FO-005_sea_of_clouds",
    "CH-009_letter_writing", "FO-006_sunken_bell", "DA-013_censor_passing",
    "DA-016_beneath_board", "CH-012_shrine_night", "FO-008_eave_bells",
    "DA-018_night_traveler", "FO-009_broken_stele", "FO-010_shooting_star",
    "DU-011_challenge_seeker", "JN-001_yangzhou_arrive", "JN-002_bridge_yield",
    "CH-027_taoist_story", "DA-020_road_measurer", "CH-028_shade_quarrel",
    "CH-029_hiccup_master", "CH-031_mountain_fog", "DU-013_lantern_riddle"
  ]);
  const bad = [];
  for (const ev of events.pool) {
    if (ev.triggerOnly || (ev.cooldown ?? 0) >= 999) continue;
    if (EXEMPT.has(ev.eventId)) continue;
    if (!(ev.tagBlock?.character ?? []).length) continue; // 現場沒人物,無所謂認不認得
    const hasRevisit = !!ev.beats.qi.variants?.revisit;
    if (!hasRevisit) bad.push(`${ev.eventId}(${ev.title})`);
  }
  assert.deepEqual(bad, [],
    `這些事件會重複遇到又有固定人物,卻沒有再遇版開場(第二次遇到會像初見):\n${bad.join("\n")}`);
});
