// 輿圖(§9.10;六州全圖規格,設計者 2026-08-23 拍板)
// 純邏輯、無 DOM。核心一句話:**步數就是趕路**。
//
// 三條拍板決議落在這裡:
//   ① 趕路與事件不互斥 —— 同一批步數同時推路程與事件。實作上路程不自己記帳,
//      而是拿 state.steps.total 的差額來算,天生不會重複扣、也不會漏算。
//   ② 開放靠兩層 —— 手上要有那一州的輿圖(道具),歷練(levelSum)也要夠。
//      擋下來的時候給的是一句人話,不是一顆灰掉的按鈕。
//   ③ 已開放的州內走得到就去得了 —— 不再設任何等級門檻。

/** 旅行狀態的初始值 */
export function newTravel(data) {
  return {
    at: data?.map?.startLocation ?? "zhen", // 現在人在哪
    to: null,          // 目的地;null = 在原地遊蕩(玩法與沒有輿圖時完全相同)
    distance: 0,       // 這趟的全程步數
    startTotal: 0,     // 出發當下的 steps.total,用來算已走多遠
    visited: []        // 到過的地方(抵達敘事只播第一次)
  };
}

export function ensureTravel(state, data) {
  if (!state.travel) state.travel = newTravel(data);
  if (!Array.isArray(state.travel.visited)) state.travel.visited = [];
  if (!state.maps) state.maps = {};
  // 中原的圖是白送的:你總認得自己家
  const first = data?.map?.provinces?.[0];
  if (first && state.maps[first.id] == null) state.maps[first.id] = true;
  return state.travel;
}

// ---------- 查表 ----------

export function allLocations(data) {
  return (data.map?.provinces ?? []).flatMap((p) =>
    p.locations.map((l) => ({ ...l, provinceId: p.id, provinceName: p.name }))
  );
}

export function locationById(data, id) {
  return allLocations(data).find((l) => l.id === id) ?? null;
}

export function provinceOf(data, locId) {
  return (data.map?.provinces ?? []).find((p) => p.locations.some((l) => l.id === locId)) ?? null;
}

/** 從 from 出發、直接連得到的地方(含步數) */
export function neighbours(data, from) {
  return (data.map?.roads ?? [])
    .filter((r) => r.a === from || r.b === from)
    .map((r) => ({ id: r.a === from ? r.b : r.a, steps: r.steps }));
}

/** 兩地之間的最短步數(Dijkstra);走不到回 null */
export function distanceBetween(data, from, to) {
  if (from === to) return 0;
  const dist = { [from]: 0 };
  const seen = new Set();
  for (;;) {
    let cur = null;
    for (const k of Object.keys(dist)) {
      if (!seen.has(k) && (cur === null || dist[k] < dist[cur])) cur = k;
    }
    if (cur === null) return null;
    if (cur === to) return dist[to];
    seen.add(cur);
    for (const n of neighbours(data, cur)) {
      const d = dist[cur] + n.steps;
      if (dist[n.id] == null || d < dist[n.id]) dist[n.id] = d;
    }
  }
}

// ---------- 走不走得到(§ 開放兩層) ----------

/** 歷練 = 六維等級總和。呼叫端傳進來,避免這支檔案反過來相依 game.js */
export function canTravelTo(state, data, locId, levelSum) {
  ensureTravel(state, data);
  const loc = locationById(data, locId);
  if (!loc) return { ok: false, why: "unknown", text: "圖上沒有這個地方。" };
  if (locId === state.travel.at) return { ok: false, why: "here", text: "你就在這裡。" };

  const prov = provinceOf(data, locId);
  if (!state.maps[prov.id]) {
    return {
      ok: false, why: "nomap",
      text: `你手上沒有${prov.name}的輿圖。${prov.mapFrom ? "(" + prov.mapFrom + ")" : ""}`
    };
  }
  if ((prov.gate ?? 0) > (levelSum ?? 0)) {
    return { ok: false, why: "green", text: prov.refuse ?? "人家看了你一眼,搖搖頭:「再練幾年吧。」" };
  }
  const distance = distanceBetween(data, state.travel.at, locId);
  if (distance == null) return { ok: false, why: "noroad", text: "從這裡沒有路過去。" };
  return { ok: true, distance };
}

/**
 * 定下目的地。半路改主意也走這一支——已走的路不退,從當下位置重新算(江湖沒有回頭路退款)。
 * @returns {{ok:boolean, distance?:number, text?:string}}
 */
export function setDestination(state, data, locId, levelSum) {
  const check = canTravelTo(state, data, locId, levelSum);
  if (!check.ok) return check;
  const extra = detourFor(state, data, locId);
  state.travel.to = locId;
  state.travel.distance = check.distance + extra;
  state.travel.startTotal = state.steps.total;
  return { ok: true, distance: state.travel.distance, detour: extra || undefined };
}

/**
 * 繞路(走錯幾次)的額外步數。
 *
 * 「只問路、不換圖」拿到的是一段口述路線——能走,但會走錯。沒有這個代價,
 * 「只問路」就完勝其他兩條(不必判定、不必付出,白拿一張圖),選擇會變成假的。
 * 只吃第一次進那一州;走過一趟之後路就記在腿上了。
 */
export function detourFor(state, data, locId) {
  const prov = provinceOf(data, locId);
  const d = prov?.detour;
  if (!d || !state.flags?.[d.flag]) return 0;
  const beenThere = (state.travel?.visited ?? []).some((v) => provinceOf(data, v)?.id === prov.id);
  return beenThere ? 0 : (d.steps ?? 0);
}

/** 放棄趕路,留在原地遊蕩 */
export function clearDestination(state) {
  if (!state.travel) return;
  state.travel.to = null;
  state.travel.distance = 0;
  state.travel.startTotal = 0;
}

// ---------- 輿圖到手 ----------

/**
 * 把某一州的輿圖交給玩家(事件效果 mapGrant)。
 * 門檻擋得住人,是因為鑰匙在江湖上——沒有事件發圖,那一州就永遠去不了。
 * @param {string} provinceId
 * @returns {{granted:boolean, province?:object, already?:boolean}}
 */
export function grantProvinceMap(state, data, provinceId) {
  ensureTravel(state, data);
  const prov = (data.map?.provinces ?? []).find((p) => p.id === provinceId);
  if (!prov) return { granted: false };
  if (state.maps[provinceId]) return { granted: false, province: prov, already: true };
  state.maps[provinceId] = true;
  return { granted: true, province: prov };
}

/** 手上有哪幾州的圖 */
export function ownedMaps(state, data) {
  ensureTravel(state, data);
  return (data.map?.provinces ?? []).filter((p) => state.maps[p.id]);
}

// ---------- 進度與抵達 ----------

/** 這趟已經走了多少步 */
export function walked(state) {
  const t = state.travel;
  if (!t?.to) return 0;
  return Math.max(0, state.steps.total - t.startTotal);
}

/** 還差多少步;沒在趕路回 null */
export function remaining(state) {
  const t = state.travel;
  if (!t?.to) return null;
  return Math.max(0, t.distance - walked(state));
}

/**
 * 檢查是否已經走到。到了就把人挪過去、清掉目的地,並回傳抵達資訊。
 * 沒到(或根本沒在趕路)回 null。
 */
export function checkArrival(state, data) {
  ensureTravel(state, data);
  const t = state.travel;
  if (!t.to) return null;
  if (remaining(state) > 0) return null;

  const loc = locationById(data, t.to);
  const firstTime = !t.visited.includes(loc.id);
  t.at = loc.id;
  t.to = null;
  t.distance = 0;
  t.startTotal = 0;
  if (firstTime) t.visited.push(loc.id);

  return {
    id: loc.id,
    name: loc.name,
    provinceName: provinceOf(data, loc.id)?.name ?? "",
    firstTime,
    // 抵達敘事只有第一次播全的;之後回到舊地給一句短的
    text: firstTime ? (loc.arrival ?? loc.see ?? "") : `你又回到了${loc.name}。`
  };
}

// ---------- 區域風味(§ 抵達=區域事件池切換) ----------

export const REGION_BONUS = 3; // 當地事件的權重倍率;數字放這裡,想調就調這一個

/**
 * 事件在目前所在地的權重倍率。
 * 現在人在哪,那裡的事就常遇到——這是既有「商路/水路/山路加權」的放大版。
 * 沒有輿圖資料時一律回 1,舊存檔與測試不受影響。
 */
export function regionMultiplier(state, data, ev) {
  const at = state?.travel?.at;
  if (!at || !data?.map) return 1;
  const loc = locationById(data, at);
  const tags = ev?.tagBlock?.region;
  if (!loc?.regionTags?.length || !tags?.length) return 1;
  return tags.some((t) => loc.regionTags.includes(t)) ? REGION_BONUS : 1;
}
