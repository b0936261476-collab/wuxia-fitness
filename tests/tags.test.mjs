import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { tagContribution, aggregateTagModifiers, successRateV2 } from "../src/engine/tags.js";
import { pickInterrupt, triggersForCheckpoint, shouldInject } from "../src/engine/triggers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const tagsData = loadJson("data/tags.json");
const triggersData = loadJson("data/triggers.json");

// ---------- §0.3 唯一判定公式:基準線 ----------

test("§0.3 基準公式:無標籤時,等級差×3%即為修正", () => {
  const rate = successRateV2({ relevantLevel: 8, benchmarkLevel: 8, tagList: [], tagsData });
  assert.equal(rate, 0.5);
});

test("§0.3 範例:船工 benchmark 8,玩家 Lv.20 → 86%", () => {
  const rate = successRateV2({ relevantLevel: 20, benchmarkLevel: 8, tagList: [], tagsData });
  assert.ok(Math.abs(rate - 0.86) < 1e-9, `expected 0.86, got ${rate}`);
});

// ---------- 各族公式 ----------

test("六維族公式:sqrt(等級)×4 百分點", () => {
  const v = tagContribution("qinggong", { sixdimLevels: { light: 25 } }, tagsData);
  assert.ok(Math.abs(v - 0.20) < 1e-9); // sqrt(25)*4 = 20 → 0.20
});

test("天賦族公式:(v-50)×coef,依情境查表", () => {
  const v = tagContribution(
    "yunqi_rel",
    { talents: { yunqi: 80 }, eventCategory: "yunqi_event" },
    tagsData
  );
  assert.ok(Math.abs(v - 0.30) < 1e-9); // (80-50)*0.01 = 0.30
});

test("天賦族:情境未對應係數表時回 0,不猜測", () => {
  const v = tagContribution(
    "yunqi_rel",
    { talents: { yunqi: 80 }, eventCategory: "unknown_context" },
    tagsData
  );
  assert.equal(v, 0);
});

test("資源族:M4 三資源系統上線前恆回 0(無 debuffTable 時)", () => {
  const v = tagContribution("hp_rel", { resourcePercents: { hp: 0.05 } }, tagsData);
  assert.equal(v, 0);
});

test("武學族:二期系統,恆回 0", () => {
  const v = tagContribution("sword", {}, tagsData);
  assert.equal(v, 0);
});

// ---------- 保險①:同族取最高(不疊加) ----------

test("保險①:同族兩個六維標籤只取最高,不相加", () => {
  const ctx = { sixdimLevels: { light: 100, inner: 25 } }; // sqrt(100)*4=40% vs sqrt(25)*4=20%
  const total = aggregateTagModifiers(["qinggong", "neigong"], ctx, tagsData);
  assert.ok(Math.abs(total - 0.40) < 1e-9, `expected 0.40 (取最高非相加), got ${total}`);
});

test("保險①:跨族則正常加總(talent + sixdim 分屬不同族),數值刻意不觸及保險②封頂", () => {
  const ctx = {
    sixdimLevels: { light: 16 }, // sqrt(16)*4=16 → 0.16
    talents: { yunqi: 65 },
    eventCategory: "yunqi_event" // (65-50)*0.01 = 0.15
  };
  const total = aggregateTagModifiers(["qinggong", "yunqi_rel"], ctx, tagsData);
  assert.ok(Math.abs(total - 0.31) < 1e-9, `expected 0.31, got ${total}`);
});

// ---------- 保險②:總修正封頂 ±50% ----------

test("保險②:極端標籤組合,總修正封頂 +50%", () => {
  const ctx = {
    sixdimLevels: { light: 10000 }, // sqrt(10000)*4 = 400% 遠超封頂
    talents: { yunqi: 150 },
    eventCategory: "yunqi_event" // (150-50)*0.01 = 100%
  };
  const total = aggregateTagModifiers(["qinggong", "yunqi_rel"], ctx, tagsData);
  assert.equal(total, 0.5);
});

test("保險②:極端負向組合,總修正封頂 −50%", () => {
  const ctx = { talents: { yunqi: 0 }, eventCategory: "yunqi_event" }; // (0-50)*0.01 = -0.5,剛好在邊界
  const total = aggregateTagModifiers(["yunqi_rel"], ctx, tagsData);
  assert.equal(total, -0.5);
});

// ---------- 保險③(最終成功率再夾一次 5%~95%) ----------

test("保險③:極端命格×高六維×低基準 仍不突破 95% 上限", () => {
  const ctx = {
    sixdimLevels: { light: 10000 },
    talents: { yunqi: 150 },
    eventCategory: "yunqi_event"
  };
  const rate = successRateV2({
    relevantLevel: 999,
    benchmarkLevel: 1,
    tagList: ["qinggong", "yunqi_rel"],
    ctx,
    tagsData
  });
  assert.equal(rate, 0.95);
});

test("保險③:越級到不可能贏,仍保留 5% 翻車空間", () => {
  const rate = successRateV2({ relevantLevel: 1, benchmarkLevel: 999, tagList: [], tagsData });
  assert.equal(rate, 0.05);
});

// ---------- 觸發器優先序(§9.3) ----------

test("觸發器優先序:重生 > 命譜 > 稱號 > 支線", () => {
  const all = triggersData.triggers.filter((t) => t.type === "PRIORITY_INTERRUPT");
  const winner = pickInterrupt(all); // 全部候選同時成立時,重生(priority 100)應勝出
  assert.equal(winner.id, "rebirth");
});

test("觸發器優先序:重生不成立時,命譜 > 稱號 > 自我認知 > 支線", () => {
  const candidates = triggersData.triggers.filter(
    (t) => t.type === "PRIORITY_INTERRUPT" && t.id !== "rebirth"
  );
  const winner = pickInterrupt(candidates);
  assert.equal(winner.id, "mingpu_reveal");
});

test("觸發器優先序:無候選時回 null", () => {
  assert.equal(pickInterrupt([]), null);
});

test("triggersForCheckpoint:依檢查點篩選", () => {
  const list = triggersForCheckpoint(triggersData.triggers, "afterLevelUp");
  const ids = list.map((t) => t.id);
  assert.ok(ids.includes("mingpu_reveal"));
  assert.ok(ids.includes("title_bestow"));
  assert.ok(!ids.includes("rebirth"));
});

// ---------- NARRATIVE_INJECT 機率/冷卻/豁免 ----------

test("NARRATIVE_INJECT:序章豁免,即使機率命中也不注入", () => {
  const trigger = triggersData.triggers.find((t) => t.id === "whisper_low_luck");
  const inject = shouldInject(trigger, { eventsSinceLastFire: Infinity, context: "prologue", roll: 0 });
  assert.equal(inject, false);
});

test("NARRATIVE_INJECT:冷卻中不注入,即使機率命中", () => {
  const trigger = triggersData.triggers.find((t) => t.id === "whisper_low_luck"); // cooldown "5 events"
  const inject = shouldInject(trigger, { eventsSinceLastFire: 2, context: "normal", roll: 0 });
  assert.equal(inject, false);
});

test("NARRATIVE_INJECT:冷卻已過、非豁免情境、機率命中 → 注入", () => {
  const trigger = triggersData.triggers.find((t) => t.id === "whisper_low_luck");
  const inject = shouldInject(trigger, { eventsSinceLastFire: 10, context: "normal", roll: 0.0001 });
  assert.equal(inject, true);
});
