// 江湖活水(總綱 §9.7.6,✓ 定版:事件式變動)
// NPC 平時靜止,不隨時間曲線成長——榜單變動一律以「江湖大事」跳變呈現:
// 玩家的成長是汗水=連續的;NPC 的成長是命運=離散的。
// 每次變動 = 一則江湖快報。數值與文案模板全在 data/jianghu_news.json,程式不寫死。
//
// Phase 2 首發只做「突破 / 衰退 / 黑馬(快報式,不動百強)」三型;
// 「除名」依總綱屬稀有且綁支線劇情,留待劇情批次。十強(#1–10)與
// 蒙面少年(#100,存查值)不參與跳變——十強級榜單地震綁主線,另批處理。

// ---------- 世界狀態 ----------

export function ensureWorld(state) {
  if (!state.world) {
    state.world = {
      ranks: null,      // {name: 目前名次};null = 從未變動,直接用 npcs.json 原始名次
      news: [],         // 江湖快報 [{date, type, text, npc}](新的在前)
      lastRoll: null,   // 上次擲「今天江湖有沒有大事」的日期(每天一擲)
      declineDebut: false // 衰退線首發是否已用掉(首發候選:崆峒老人,§9.7.6)
    };
  }
  return state.world;
}

function materializeRanks(state, data) {
  const w = ensureWorld(state);
  if (!w.ranks) {
    w.ranks = {};
    for (const n of data.npcs.top100) w.ranks[n.name] = n.rank;
  }
  return w.ranks;
}

/** 目前生效的百強名冊(套用跳變後的名次;從未變動時原樣回傳,零成本) */
export function effectiveTop100(state, data) {
  if (!state.world?.ranks) return data.npcs.top100;
  return data.npcs.top100
    .map((n) => ({ ...n, rank: state.world.ranks[n.name] ?? n.rank }))
    .sort((a, b) => a.rank - b.rank);
}

/** 目前生效的 npcs 資料(top100 換成跳變後版本),給既有的名冊函式直接用 */
export function effectiveNpcs(state, data) {
  if (!state.world?.ranks) return data.npcs;
  return { ...data.npcs, top100: effectiveTop100(state, data) };
}

/** 江湖快報清單(新的在前) */
export function jianghuNews(state) {
  return state.world?.news ?? [];
}

// ---------- 快報生成 ----------

function fill(tpl, vars) {
  // 佔位符是中文({人名}{舊}{新}…),\w 不吃中文,得用「非右括號」匹配
  return tpl.replace(/\{([^{}]+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function randInt(range, rng) {
  const [lo, hi] = range;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** NPC 顯示名(帶渾名) */
function label(npc) {
  return npc.nickname ? `「${npc.nickname}」${npc.name}` : npc.name;
}

/**
 * 每天擲一次:今天江湖有沒有大事(§9.7.6 全榜每月約 1–3 件 → 日機率入資料檔)。
 * 有事就挑一型執行、產一則快報;沒事回 null。
 *
 * @param {number} playerRank 玩家目前約略名次(追逐保護用:緊鄰玩家上方
 *   protectRange 名內的 NPC 豁免突破抽選——快追到的人不會突然飛走)
 * @returns 產生的快報物件或 null
 */
export function rollJianghuNews(state, data, todayStr, playerRank, rng = Math.random) {
  const cfg = data.jianghu_news?.config;
  if (!cfg || !data.npcs) return null;
  const w = ensureWorld(state);
  if (w.lastRoll === todayStr) return null;
  w.lastRoll = todayStr;
  if (rng() >= cfg.dailyChance) return null;

  // 依權重挑事件型
  const weights = Object.entries(cfg.typeWeights);
  const total = weights.reduce((a, [, v]) => a + v, 0);
  let roll = rng() * total;
  let type = weights[weights.length - 1][0];
  for (const [t, v] of weights) {
    if (roll < v) { type = t; break; }
    roll -= v;
  }

  let news = null;
  if (type === "breakthrough") news = doBreakthrough(state, data, playerRank, rng);
  else if (type === "decline") news = doDecline(state, data, rng);
  else if (type === "blackhorse") news = doBlackhorse(data, rng);

  if (!news) return null;
  news.date = todayStr;
  w.news.unshift(news);
  if (w.news.length > (cfg.keep ?? 30)) w.news.length = cfg.keep ?? 30;
  return news;
}

/** 突破:#11–#99 抽一人往前跳(不進十強);中間的人各退一名 */
function doBreakthrough(state, data, playerRank, rng) {
  const cfg = data.jianghu_news.config;
  const ranks = materializeRanks(state, data);
  const candidates = effectiveTop100(state, data).filter((n) => {
    if (n.rank < 11 || n.rank > 99) return false; // 十強綁主線;#100 蒙面少年是存查值
    if (playerRank != null && n.rank >= playerRank - cfg.protectRange && n.rank < playerRank) return false; // 追逐保護
    return true;
  });
  if (!candidates.length) return null;
  const npc = pick(candidates, rng);
  const oldRank = npc.rank;
  const newRank = Math.max(11, oldRank - randInt(cfg.breakthroughJump, rng));
  if (newRank === oldRank) return null;
  for (const [name, r] of Object.entries(ranks)) {
    if (r >= newRank && r < oldRank) ranks[name] = r + 1; // 被擠下去的各退一名
  }
  ranks[npc.name] = newRank;
  const tpl = pick(data.jianghu_news.templates.breakthrough, rng);
  return { type: "breakthrough", npc: npc.name, text: fill(tpl, { 人名: label(npc), 舊: oldRank, 新: newRank }) };
}

/** 衰退:#11–#99 抽一人往後掉(掉不出百強);首發候選崆峒老人(§9.7.6) */
function doDecline(state, data, rng) {
  const cfg = data.jianghu_news.config;
  const w = ensureWorld(state);
  const ranks = materializeRanks(state, data);
  const pool = effectiveTop100(state, data).filter((n) => n.rank >= 11 && n.rank <= 99);
  if (!pool.length) return null;
  let npc = null;
  if (!w.declineDebut && cfg.declineDebut) {
    npc = pool.find((n) => n.name === cfg.declineDebut) ?? null;
  }
  if (!npc) npc = pick(pool, rng);
  w.declineDebut = true;
  const oldRank = npc.rank;
  const newRank = Math.min(99, oldRank + randInt(cfg.declineDrop, rng));
  if (newRank === oldRank) return null;
  for (const [name, r] of Object.entries(ranks)) {
    if (r > oldRank && r <= newRank) ranks[name] = r - 1; // 後面的人各進一名
  }
  ranks[npc.name] = newRank;
  const tpl = pick(data.jianghu_news.templates.decline, rng);
  return { type: "decline", npc: npc.name, text: fill(tpl, { 人名: label(npc), 舊: oldRank, 新: newRank }) };
}

/** 黑馬:總冊萬人中空降新人(快報式;不動百強,名字用隨機表現生) */
function doBlackhorse(data, rng) {
  const cfg = data.jianghu_news.config;
  const bh = cfg.blackhorse;
  const name = pick(bh.surnames, rng) + pick(bh.givens, rng);
  const rank = Math.round(randInt(bh.rankRange, rng) / 1000) * 1000;
  const tpl = pick(data.jianghu_news.templates.blackhorse, rng);
  return { type: "blackhorse", npc: null, text: fill(tpl, { 人名: name, 名次: rank.toLocaleString() }) };
}
