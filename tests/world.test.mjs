// 江湖活水測試(總綱 §9.7.6:NPC 事件式變動 + 江湖快報)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { newState } from "../src/engine/game.js";
import {
  ensureWorld, effectiveTop100, effectiveNpcs, jianghuNews, rollJianghuNews
} from "../src/engine/world.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  npcs: loadJson("data/npcs.json"),
  jianghu_news: loadJson("data/jianghu_news.json")
};

const D0 = "2026-08-19", D1 = "2026-08-20";

/** rng 序列器:依序回傳給定值,用完回最後一個 */
function seq(...vals) {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
}

test("沒變動時 effectiveTop100 原樣回傳(零成本),快報清單為空", () => {
  const s = newState();
  assert.equal(effectiveTop100(s, data), data.npcs.top100);
  assert.equal(effectiveNpcs(s, data), data.npcs);
  assert.deepEqual(jianghuNews(s), []);
});

test("突破:抽中的人往前跳,中間的人各退一名,十強與蒙面少年不動", () => {
  const s = newState();
  // 骰序:dailyChance 命中(0.01)→ 型別(0.01 → breakthrough)→ 抽人(0.5)→ 跳幅
  const news = rollJianghuNews(s, data, D0, 500000, seq(0.01, 0.01, 0.5, 0.5));
  assert.ok(news, "應該產生一則快報");
  assert.equal(news.type, "breakthrough");
  assert.match(news.text, /第\d+名/);

  const eff = effectiveTop100(s, data);
  // 名次仍是 1~100 不重不漏
  const ranks = eff.map((n) => n.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 100 }, (_, i) => i + 1));
  // 十強與 #100 蒙面少年紋風不動
  for (let r = 1; r <= 10; r++) {
    assert.equal(eff.find((n) => n.rank === r).name, data.npcs.top100.find((n) => n.rank === r).name);
  }
  assert.equal(eff.find((n) => n.rank === 100).name, "蒙面少年");
  // 抽中的人真的往前了
  const moved = data.npcs.top100.find((n) => n.name === news.npc);
  assert.ok(s.world.ranks[news.npc] < moved.rank);
});

test("每天只擲一次:同日第二次呼叫直接跳過", () => {
  const s = newState();
  rollJianghuNews(s, data, D0, 500000, seq(0.01, 0.01, 0.5, 0.5));
  const second = rollJianghuNews(s, data, D0, 500000, seq(0.01, 0.01, 0.5, 0.5));
  assert.equal(second, null);
  const next = rollJianghuNews(s, data, D1, 500000, seq(0.99));
  assert.equal(next, null); // 隔天有擲,但 0.99 沒中
  assert.equal(s.world.lastRoll, D1);
});

test("追逐保護:玩家上方 10 名內的 NPC 不會被抽中突破", () => {
  const s = newState();
  // 玩家在第 60 名 → 當下名次在 50~59 的人豁免抽選。抽 1000 次,
  // 每次跳變都回頭驗證:跳變者「跳之前那一刻」的名次不在保護區。
  for (let day = 0; day < 1000; day++) {
    const before = new Map(effectiveTop100(s, data).map((n) => [n.name, n.rank]));
    const date = `roll-${day}`;
    const news = rollJianghuNews(s, data, date, 60, seq(0.01, 0.01, (day % 100) / 100, 0.5));
    if (news?.type === "breakthrough") {
      const prevRank = before.get(news.npc);
      assert.ok(!(prevRank >= 50 && prevRank < 60), `${news.npc} 當時排第 ${prevRank},在保護區內不該主動突破`);
    }
  }
});

test("衰退:首發是崆峒老人,往後掉但掉不出百強;後面的人遞補", () => {
  const s = newState();
  // 型別骰:0.60(落在 decline 區間:55~85)
  const news = rollJianghuNews(s, data, D0, 500000, seq(0.01, 0.60, 0.5, 0.5));
  assert.ok(news);
  assert.equal(news.type, "decline");
  assert.match(news.npc, /崆峒老人/);
  const old = data.npcs.top100.find((n) => n.name === news.npc).rank;
  assert.ok(s.world.ranks[news.npc] > old, "衰退要往後掉");
  assert.ok(s.world.ranks[news.npc] <= 99, "掉不出百強");
  const ranks = effectiveTop100(s, data).map((n) => n.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 100 }, (_, i) => i + 1));
});

test("黑馬:快報式空降,不動百強名冊", () => {
  const s = newState();
  // 型別骰:0.90(落在 blackhorse 區間:85~100)
  const news = rollJianghuNews(s, data, D0, 500000, seq(0.01, 0.90, 0.3, 0.3, 0.3));
  assert.ok(news);
  assert.equal(news.type, "blackhorse");
  assert.match(news.text, /位/);
  assert.equal(s.world.ranks, null, "黑馬不動百強");
});
