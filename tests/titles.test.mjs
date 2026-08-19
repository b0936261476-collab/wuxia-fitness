import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { tagContribution } from "../src/engine/tags.js";
import {
  titleTiers, balancedTier, currentBalancedTitle,
  rankingTitleForPercentile, equippedTitle
} from "../src/engine/titles.js";
import { newState, addExp, createCharacter, chooseOption, startNextEvent, addSteps } from "../src/engine/game.js";
import { eligibleEvents } from "../src/engine/events2.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  events: loadJson("data/events.json"),
  titles: loadJson("data/titles.json"),
  items: loadJson("data/items.json"),
  tags: loadJson("data/tags.json"),
  quiz: loadJson("data/quiz.json")
};

// ---------- §8.2 武道里程碑(等級門檻) ----------

test("titles.json:武道里程碑門檻為等級(10/20/30/45/75/110),不是經驗值", () => {
  assert.deepEqual(data.titles.milestones.thresholds, [10, 20, 30, 45, 75, 110]);
});

test("addExp:跨過Lv.10門檻解鎖「掠影追風」,且只認等級不認經驗值", () => {
  const s = newState();
  addExp(s, { light: 5500 }, data); // 剛好等於thresholdForLevel(10)
  assert.equal(s.milestones.light, 0);
  assert.equal(data.titles.milestones.titles.light[s.milestones.light], "掠影追風");
});

test("addExp:里程碑永久保留,扣分不摘除(等級門檻版)", () => {
  const s = newState();
  addExp(s, { hard: 5500 }, data);
  assert.equal(s.milestones.hard, 0);
  addExp(s, { hard: -5400 }, data); // 大量扣分,等級掉回接近0
  assert.equal(s.milestones.hard, 0); // 稱號仍在
});

// ---------- §8.3 均衡里程碑 ----------

test("addExp:六維等級總和達60解鎖「六藝初成」", () => {
  const s = newState();
  for (const dim of ["light", "inner", "hard", "soft", "eye", "ear"]) {
    addExp(s, { [dim]: 5500 }, data);
  }
  assert.equal(s.balancedMilestone, 0);
  assert.equal(currentBalancedTitle(s, data), "六藝初成");
});

test("titleTiers/balancedTier:未解鎖時為0(標籤引擎讀0視為無加成)", () => {
  const s = newState();
  const tiers = titleTiers(s);
  for (const dim of Object.keys(tiers)) assert.equal(tiers[dim], 0);
  assert.equal(balancedTier(s), 0);
});

test("titleTiers:解鎖第1階里程碑後回傳階數1(供§8.4輕加成公式:階數×0.5%)", () => {
  const s = newState();
  addExp(s, { light: 5500 }, data);
  assert.equal(titleTiers(s).light, 1);
});

// ---------- §8.4 輕加成掛標籤引擎 ----------

test("tagContribution:title_light在階數1時貢獻0.5%", () => {
  const v = tagContribution("title_light", { titleTiers: { light: 1 } }, data.tags);
  assert.ok(Math.abs(v - 0.005) < 1e-9);
});

test("tagContribution:title_light在階數6(全滿階)貢獻3%", () => {
  const v = tagContribution("title_light", { titleTiers: { light: 6 } }, data.tags);
  assert.ok(Math.abs(v - 0.03) < 1e-9);
});

test("tagContribution:title_balanced讀ctx.balancedTier(非titleTiers)", () => {
  const v = tagContribution("title_balanced", { balancedTier: 2 }, data.tags);
  assert.ok(Math.abs(v - 0.01) < 1e-9);
});

test("tagContribution:未解鎖(0或缺省)時貢獻0", () => {
  assert.equal(tagContribution("title_light", {}, data.tags), 0);
  assert.equal(tagContribution("title_light", { titleTiers: { light: 0 } }, data.tags), 0);
});

// ---------- §8.5 自動配戴規則 ----------

test("equippedTitle①②:單維/多維標籤時,配weight最高那維的里程碑稱號", () => {
  const s = newState();
  addExp(s, { hard: 5500 }, data); // 解鎖「鐵骨錚錚」
  addExp(s, { light: 5500 }, data); // 解鎖「掠影追風」
  const r = equippedTitle(s, data, { hard: 0.5, light: 0.3 }); // hard weight較高
  assert.equal(r.source, "milestone");
  assert.equal(r.dim, "hard");
  assert.equal(r.title, "鐵骨錚錚");
});

test("equippedTitle③:無六維標籤時,配群俠錄或均衡稱號(取成就較高者)", () => {
  const s = newState();
  for (const dim of ["light", "inner", "hard", "soft", "eye", "ear"]) {
    addExp(s, { [dim]: 5500 }, data); // 均衡里程碑第0階「六藝初成」
  }
  const r = equippedTitle(s, data, undefined, { percentile: 0.99, tierIndex: 5 }); // top1檔
  assert.ok(["balanced", "ranking"].includes(r.source));
  assert.ok(r.title === "六藝初成" || r.title === "執掌武林");
});

test("equippedTitle④:什麼稱號都沒有時回defaultTitle「無名之輩」", () => {
  const s = newState();
  const r = equippedTitle(s, data, undefined, undefined);
  assert.equal(r.source, "default");
  assert.equal(r.title, "無名之輩");
});

test("equippedTitle:該維雖是判定重點但玩家未解鎖里程碑時,落到③/④繼續判斷", () => {
  const s = newState();
  const r = equippedTitle(s, data, { hard: 1 }, undefined); // hard未解鎖任何里程碑
  assert.equal(r.source, "default");
});

// ---------- §8.1 群俠錄百分位查表 ----------

test("rankingTitleForPercentile:各百分位帶對應正確稱號", () => {
  assert.equal(rankingTitleForPercentile(0.3, data), "江湖行者");
  assert.equal(rankingTitleForPercentile(0.6, data), "嶄露頭角");
  assert.equal(rankingTitleForPercentile(0.85, data), "聲名鵲起");
  assert.equal(rankingTitleForPercentile(0.96, data), "威震一方");
  assert.equal(rankingTitleForPercentile(0.995, data), "執掌武林");
  assert.equal(rankingTitleForPercentile(0.9995, data), "睥睨天下");
  assert.equal(rankingTitleForPercentile(0.9995, data, { isRank1: true }), "天下無雙");
});

// ---------- game.js 整合 ----------

/** 強制抽中 DU-001 碼頭比腕(判定維=硬功)的 rng */
function drawArmWrestle(state) {
  const candidates = eligibleEvents(state, data, "2026-08-19");
  const idx = candidates.findIndex((c) => c.ev.eventId === "DU-001_arm_wrestle_dock");
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  return () => (idx + 0.5) / total;
}

/** 已創角的狀態需先跳過序章三部曲 */
function skipIntro(s) {
  for (const id of data.events.config.intro.sequence) {
    s.journal.push({ n: 0, id, date: "2026-08-01" });
  }
}

test("事件結算後 entry.equippedTitle 反映當下自動配戴的稱號", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  skipIntro(s);
  addExp(s, { hard: 5500 }, data); // 硬功 Lv.10,解鎖「鐵骨錚錚」
  addSteps(s, 1000);
  startNextEvent(s, data, "2026-08-19", drawArmWrestle(s));
  const { entry } = chooseOption(s, data, "A", "2026-08-19", () => 0.5); // A=硬功判定
  assert.equal(entry.equippedTitle, "鐵骨錚錚");
});

test("里程碑輕加成確實提高判定成功率", () => {
  const withoutTitle = newState();
  createCharacter(withoutTitle, [{ questionId: "q03", optionId: "a" }], data);
  skipIntro(withoutTitle);
  withoutTitle.exp.hard = 100;
  addSteps(withoutTitle, 1000);
  startNextEvent(withoutTitle, data, "2026-08-19", drawArmWrestle(withoutTitle));
  const entryNoTitle = chooseOption(withoutTitle, data, "A", "2026-08-19", () => 0.99).entry;

  const withTitle = newState();
  createCharacter(withTitle, [{ questionId: "q03", optionId: "a" }], data);
  skipIntro(withTitle);
  withTitle.exp.hard = 100;
  addExp(withTitle, { hard: 5400 }, data); // 補到解鎖「鐵骨錚錚」
  addSteps(withTitle, 1000);
  startNextEvent(withTitle, data, "2026-08-19", drawArmWrestle(withTitle));
  const entryWithTitle = chooseOption(withTitle, data, "A", "2026-08-19", () => 0.99).entry;

  assert.ok(entryNoTitle.rate != null && entryWithTitle.rate != null);
  assert.ok(entryWithTitle.rate > entryNoTitle.rate);
});
