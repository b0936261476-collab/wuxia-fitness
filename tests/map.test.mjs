// 輿圖驗收(§9.10;2026-08-23 設計者拍板的三條規則)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  newTravel, ensureTravel, allLocations, locationById, provinceOf, neighbours,
  distanceBetween, canTravelTo, setDestination, clearDestination,
  walked, remaining, checkArrival, regionMultiplier, REGION_BONUS,
  grantProvinceMap, ownedMaps, detourFor
} from "../src/engine/map.js";
import { newState, addSteps } from "../src/engine/game.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = { map: loadJson("data/map.json"), events: loadJson("data/events.json") };

function hero(levelSum) {
  const s = newState();
  ensureTravel(s, data);
  return s;
}

// ---------- 資料本身 ----------

test("六州、二十八個地點、每條路的端點都在圖上", () => {
  assert.equal(data.map.provinces.length, 6);
  const locs = allLocations(data);
  assert.equal(locs.length, 28);
  const ids = new Set(locs.map((l) => l.id));
  for (const r of data.map.roads) {
    assert.ok(ids.has(r.a), `路的端點 ${r.a} 不在圖上`);
    assert.ok(ids.has(r.b), `路的端點 ${r.b} 不在圖上`);
  }
});

test("沒有孤島:每個地方都連得到起點", () => {
  for (const l of allLocations(data)) {
    assert.ok(distanceBetween(data, data.map.startLocation, l.id) != null, `${l.name} 走不到`);
  }
});

test("開放進度:中原、江南、北疆已開,其餘三州仍鎖著", () => {
  const open = data.map.provinces.filter((p) => p.open).map((p) => p.id);
  assert.deepEqual(open, ["zhongyuan", "jiangnan", "beijiang"]);
});

test("每個鎖著的州都要有一句「歷練不夠」的人話——不能是灰掉的按鈕", () => {
  for (const p of data.map.provinces.filter((x) => !x.open)) {
    assert.ok(p.refuse && p.refuse.length > 10, `${p.name} 缺 refuse 文案`);
    assert.ok(p.mapFrom && p.mapFrom.length > 5, `${p.name} 沒說輿圖從哪來`);
  }
});

test("中原七個地方都有抵達敘事(現在就走得到的,不能沒有文案)", () => {
  const zy = data.map.provinces[0];
  for (const l of zy.locations) {
    assert.ok(l.arrival && l.arrival.length > 20, `${l.name} 缺抵達敘事`);
  }
});

test("每個地方都寫了「到了會看到什麼」(設計者要求:別走到了才發現跟想的不一樣)", () => {
  for (const l of allLocations(data)) {
    assert.ok(l.see && l.see.length > 10, `${l.name} 缺 see`);
  }
});

// ---------- 距離 ----------

test("distanceBetween:相鄰取直達,繞遠路不會被誤算", () => {
  assert.equal(distanceBetween(data, "zhen", "luoyang"), 12000);
  assert.equal(distanceBetween(data, "zhen", "zhen"), 0);
});

test("distanceBetween:不相鄰時取最短路徑", () => {
  // 崆峒派要先過雲嶺:10,000 + 11,000
  assert.equal(distanceBetween(data, "zhen", "kongtong"), 21000);
});

test("跨州是長途:中原小鎮到揚州要走十萬步以上", () => {
  const d = distanceBetween(data, "zhen", "yangzhou");
  assert.ok(d >= 95000, `只有 ${d} 步,跨州應該更遠`);
});

test("走到西域是季目標:一天八千步要一個月以上", () => {
  const d = distanceBetween(data, "zhen", "dunhuang");
  assert.ok(d / 8000 >= 28, `${Math.round(d / 8000)} 天,太短了`);
});

// ---------- 開放的兩層門檻 ----------

test("沒有那一州的輿圖就走不到,而且要說得出圖從哪來", () => {
  const s = hero();
  const r = canTravelTo(s, data, "yangzhou", 999);
  assert.equal(r.ok, false);
  assert.equal(r.why, "nomap");
  assert.ok(r.text.includes("江南"));
  assert.ok(r.text.includes("鏢局"), "應該告訴玩家圖從哪來");
});

test("有圖但歷練不夠:擋下來的是一句人話,不是錯誤訊息", () => {
  const s = hero();
  s.maps.jiangnan = true;
  const r = canTravelTo(s, data, "yangzhou", 10);
  assert.equal(r.ok, false);
  assert.equal(r.why, "green");
  assert.equal(r.text, data.map.provinces[1].refuse);
});

test("有圖又夠歷練就走得到", () => {
  const s = hero();
  s.maps.jiangnan = true;
  const r = canTravelTo(s, data, "yangzhou", 60);
  assert.equal(r.ok, true);
  assert.ok(r.distance > 0);
});

test("已開放的州內走得到就去得了——中原七處全部不設門檻", () => {
  const s = hero();
  for (const l of data.map.provinces[0].locations) {
    if (l.id === s.travel.at) continue;
    assert.equal(canTravelTo(s, data, l.id, 0).ok, true, `${l.name} 不該被擋`);
  }
});

test("中原的圖是白送的,新角色一開始就有", () => {
  const s = newState();
  ensureTravel(s, data);
  assert.equal(s.maps.zhongyuan, true);
  assert.equal(s.travel.at, "zhen");
});

// ---------- 趕路:步數同時推路程與事件 ----------

test("同一批步數同時推路程與事件,不互斥", () => {
  const s = hero();
  setDestination(s, data, "luoyang", 0);
  const before = s.steps.total;
  addSteps(s, 5000);
  assert.equal(walked(s), 5000);
  assert.equal(s.steps.total, before + 5000, "步數沒有被趕路吃掉,事件那邊照樣算得到");
  assert.equal(remaining(s), 7000);
});

test("走滿了才算到,差一步都不算", () => {
  const s = hero();
  setDestination(s, data, "biaoju", 0); // 8,000 步
  addSteps(s, 7999);
  assert.equal(checkArrival(s, data), null);
  addSteps(s, 1);
  const a = checkArrival(s, data);
  assert.ok(a);
  assert.equal(a.id, "biaoju");
  assert.equal(s.travel.at, "biaoju");
  assert.equal(s.travel.to, null);
});

test("抵達敘事第一次播全的,再回舊地給短的", () => {
  const s = hero();
  setDestination(s, data, "biaoju", 0);
  addSteps(s, 8000);
  const first = checkArrival(s, data);
  assert.equal(first.firstTime, true);
  assert.equal(first.text, locationById(data, "biaoju").arrival);

  setDestination(s, data, "zhen", 0);
  addSteps(s, 8000);
  checkArrival(s, data);
  setDestination(s, data, "biaoju", 0);
  addSteps(s, 8000);
  const again = checkArrival(s, data);
  assert.equal(again.firstTime, false);
  assert.ok(again.text.includes("又回到"));
});

test("半路改目的地:已走的路不退,從當下位置重新算", () => {
  const s = hero();
  setDestination(s, data, "luoyang", 0); // 12,000
  addSteps(s, 5000);
  assert.equal(remaining(s), 7000);

  setDestination(s, data, "dukou", 0);   // 改去臨江渡:9,000,從頭算
  assert.equal(remaining(s), 9000);
  assert.equal(s.travel.at, "zhen", "人還沒動,只是換了個方向");
});

test("不選目的地就是在原地遊蕩,一切照舊", () => {
  const s = hero();
  assert.equal(s.travel.to, null);
  assert.equal(remaining(s), null);
  addSteps(s, 20000);
  assert.equal(checkArrival(s, data), null);
  assert.equal(s.travel.at, "zhen", "沒選目的地就不會被莫名其妙移動");
});

test("放棄趕路回到原地遊蕩", () => {
  const s = hero();
  setDestination(s, data, "luoyang", 0);
  addSteps(s, 3000);
  clearDestination(s);
  assert.equal(remaining(s), null);
  assert.equal(s.travel.at, "zhen");
});

// ---------- 區域風味 ----------

test("人在哪,那裡的事就常遇到", () => {
  const s = hero();
  const townEvent = data.events.pool.find((e) => (e.tagBlock?.region || []).includes("中原小鎮"));
  const mountainEvent = data.events.pool.find((e) => (e.tagBlock?.region || []).includes("山道"));
  assert.ok(townEvent && mountainEvent);

  assert.equal(regionMultiplier(s, data, townEvent), REGION_BONUS, "在鎮上,鎮上的事該常遇到");
  assert.equal(regionMultiplier(s, data, mountainEvent), 1, "在鎮上不該一直遇到山裡的事");

  s.travel.at = "yunling";
  assert.equal(regionMultiplier(s, data, mountainEvent), REGION_BONUS);
  assert.equal(regionMultiplier(s, data, townEvent), 1);
});

test("沒有輿圖資料時一律回 1——舊存檔與既有測試不受影響", () => {
  const s = newState();
  assert.equal(regionMultiplier(s, {}, data.events.pool[0]), 1);
  assert.equal(regionMultiplier({}, data, data.events.pool[0]), 1);
});

// ---------- 雜項 ----------

test("neighbours / provinceOf / locationById 查得到東西", () => {
  assert.ok(neighbours(data, "zhen").some((n) => n.id === "luoyang"));
  assert.equal(provinceOf(data, "yangzhou").name, "江南");
  assert.equal(locationById(data, "dunhuang").name, "敦煌");
  assert.equal(locationById(data, "沒這地方"), null);
});

test("newTravel:起點取自資料檔,不寫死", () => {
  const t = newTravel(data);
  assert.equal(t.at, data.map.startLocation);
  assert.deepEqual(t.visited, []);
});

// ---------- 輿圖到手(事件效果 mapGrant) ----------

test("mapGrant:事件可以把一州的輿圖交到玩家手上", () => {
  const s = hero();
  assert.equal(canTravelTo(s, data, "yangzhou", 999).why, "nomap");

  const r = grantProvinceMap(s, data, "jiangnan");
  assert.equal(r.granted, true);
  assert.equal(r.province.name, "江南");
  assert.equal(s.maps.jiangnan, true);
  assert.equal(canTravelTo(s, data, "yangzhou", 999).ok, true);
});

test("mapGrant:同一張圖不會重複發", () => {
  const s = hero();
  grantProvinceMap(s, data, "jiangnan");
  const again = grantProvinceMap(s, data, "jiangnan");
  assert.equal(again.granted, false);
  assert.equal(again.already, true);
});

test("mapGrant:沒這個州就安靜失敗,不炸", () => {
  const s = hero();
  assert.deepEqual(grantProvinceMap(s, data, "沒這州"), { granted: false });
});

test("ownedMaps:新角色手上只有中原", () => {
  const s = hero();
  assert.deepEqual(ownedMaps(s, data).map((p) => p.id), ["zhongyuan"]);
});

test("⚠️ 門檻與鑰匙要成對:每個鎖著的州都該有事件發得出圖(內容待補時此測試會提醒)", () => {
  const events = data.events.pool;
  const granted = new Set();
  for (const e of events) {
    for (const m of JSON.stringify(e).matchAll(/"mapGrant"\s*:\s*"([a-z]+)"/g)) granted.add(m[1]);
  }
  const locked = data.map.provinces.filter((p) => !p.open).map((p) => p.id);
  const missing = locked.filter((id) => !granted.has(id));
  // 只對「已宣告開放」的州強制要求鑰匙;其餘州列出來當待辦提醒
  const opened = data.map.provinces.filter((p) => p.open && p.id !== "zhongyuan").map((p) => p.id);
  for (const id of opened) {
    assert.ok(granted.has(id), `${id} 已開放卻沒有任何事件發得出它的輿圖——玩家永遠去不了`);
  }
  assert.ok(Array.isArray(missing));
});

// ---------- 江南開放後的整條路(B10) ----------

test("鑰匙到位:江南已開放,而且有事件發得出江南的輿圖", () => {
  const granted = new Set();
  for (const e of data.events.pool) {
    for (const m of JSON.stringify(e).matchAll(/"mapGrant"\s*:\s*"([a-z]+)"/g)) granted.add(m[1]);
  }
  assert.ok(granted.has("jiangnan"), "江南開了卻沒有事件發圖——玩家永遠去不了");
});

test("江南的事只在江南遇得到,不會在中原亂入", () => {
  const jn = data.events.pool.filter((e) => e.eventId.startsWith("JN-") && e.eventId !== "JN-000_biaoju_map");
  assert.ok(jn.length >= 9);
  for (const e of jn) {
    const c = e.conditions || {};
    assert.ok(c.atProvince || c.atLocation, `${e.eventId} 沒有地域門檻,會在中原亂入`);
  }
});

test("鑰匙事件掛在裴家鏢局,三條分支都拿得到圖(不會卡死)", () => {
  const key = data.events.pool.find((e) => e.eventId === "JN-000_biaoju_map");
  assert.equal(key.conditions.atLocation, "biaoju");
  const s = JSON.stringify(key.beats.he);
  const grants = [...s.matchAll(/"mapGrant"\s*:\s*"jiangnan"/g)].length;
  assert.ok(grants >= 4, `只有 ${grants} 個結局給圖——接鏢失敗那條也必須給,否則玩家可能永遠去不了江南`);
});

test("繞路:只問路的人第一趟要多走,走過一次就不再罰", () => {
  const s = hero();
  grantProvinceMap(s, data, "jiangnan");
  const plain = setDestination(s, data, "yangzhou", 999).distance;

  const s2 = hero();
  grantProvinceMap(s2, data, "jiangnan");
  s2.flags.jiangnan_oral_route = true;
  const detoured = setDestination(s2, data, "yangzhou", 999);
  assert.equal(detoured.distance, plain + 20000);
  assert.equal(detoured.detour, 20000);

  // 到過江南之後就記在腿上了
  s2.travel.visited.push("yangzhou");
  assert.equal(setDestination(s2, data, "jinghu", 999).detour, undefined);
});

test("繞路只罰那一州:沒有 detour 設定的州不受影響", () => {
  const s = hero();
  s.flags.jiangnan_oral_route = true;
  assert.equal(setDestination(s, data, "luoyang", 0).detour, undefined);
});
