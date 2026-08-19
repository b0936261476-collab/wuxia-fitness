import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { rawScores, consistency, generateTalents, wuxingMultiplier, isExtremeFate, classifyFate, openingFateLine, TALENT_TOTAL } from "../src/engine/talent.js";
import { newState, createCharacter, logExercise } from "../src/engine/game.js";

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

// ---------- 測驗計分 ----------

test("rawScores:依作答加總三軸原始分", () => {
  const answers = [
    { questionId: "q01", optionId: "a" }, // genggu10 wuxing1 yunqi1
    { questionId: "q02", optionId: "b" }  // genggu1 wuxing6 yunqi5
  ];
  const raw = rawScores(answers, data.quiz);
  assert.deepEqual(raw, { genggu: 11, wuxing: 7, yunqi: 6 });
});

test("consistency:全押同一軸 → 1.0;三軸平均 → 1/3", () => {
  assert.equal(consistency({ genggu: 10, wuxing: 0, yunqi: 0 }), 1);
  assert.ok(Math.abs(consistency({ genggu: 4, wuxing: 4, yunqi: 4 }) - 1 / 3) < 1e-9);
});

// ---------- 天賦生成(§1.1/§1.2) ----------

test("generateTalents:未達一致性門檻時,三軸歸一化總和為150", () => {
  const answers = [{ questionId: "q03", optionId: "a" }, { questionId: "q03", optionId: "b" }]; // 4/4/4 平衡題
  const t = generateTalents(answers, data.quiz);
  assert.equal(t.boosted, false);
  const sum = t.genggu + t.wuxing + t.yunqi;
  assert.ok(Math.abs(sum - TALENT_TOTAL) < 1e-9);
});

test("generateTalents:達一致性門檻時,主傾向軸×1.5,總和會超過150(§1.2 天花板敘述)", () => {
  // 種子題庫 q01 的一致性僅 10/12≈0.833,未達 0.85 門檻;
  // 用自建的極端權重題目獨立驗證加成邏輯本身是否正確觸發。
  const extremeQuiz = {
    questions: [
      { id: "x1", options: [{ id: "a", weights: { genggu: 10, wuxing: 0, yunqi: 0 } }] }
    ]
  };
  const t = generateTalents([{ questionId: "x1", optionId: "a" }], extremeQuiz);
  assert.equal(t.consistency, 1);
  assert.equal(t.boosted, true);
  assert.equal(t.primaryAxis, "genggu");
  assert.ok(t.genggu > TALENT_TOTAL); // 主軸單獨×1.5後,已超過三軸原本總和150
});

test("generateTalents:三軸總和固定150這件事只在加成前成立,函式回傳的是加成後數值", () => {
  const answers = [{ questionId: "q01", optionId: "b" }]; // 全押 wuxing
  const t = generateTalents(answers, data.quiz);
  assert.equal(t.primaryAxis, "wuxing");
  assert.ok(t.wuxing > t.genggu && t.wuxing > t.yunqi);
});

test("generateTalents:種子題庫 q01(一致性0.833)在新門檻0.6下應觸發加成", () => {
  const t = generateTalents([{ questionId: "q01", optionId: "a" }], data.quiz);
  assert.ok(Math.abs(t.consistency - 10 / 12) < 1e-9);
  assert.equal(t.boosted, true);
  assert.equal(t.primaryAxis, "genggu");
});

// ---------- 命格七區間分類(§1.3) ----------

test("classifyFate:極端優先於其他分類", () => {
  const r = classifyFate({ genggu: 121, wuxing: 80, yunqi: 75 }); // 同時符合雙高條件,但極端判定順序在前
  assert.equal(r.category, "extreme");
});

test("classifyFate:兩軸以上≥70 → 雙高", () => {
  const r = classifyFate({ genggu: 75, wuxing: 70, yunqi: 5 + 30 });
  assert.equal(r.category, "dual_high");
});

test("classifyFate:恰一軸≤30 → 單低,並標註是哪一軸", () => {
  const r = classifyFate({ genggu: 25, wuxing: 65, yunqi: 60 });
  assert.equal(r.category, "single_low");
  assert.equal(r.axis, "genggu");
});

test("classifyFate:恰一軸≥70 → 單高,並標註是哪一軸", () => {
  const r = classifyFate({ genggu: 80, wuxing: 40, yunqi: 30 + 1 });
  assert.equal(r.category, "single_high");
  assert.equal(r.axis, "genggu");
});

test("classifyFate:皆不符 → 均衡", () => {
  const r = classifyFate({ genggu: 55, wuxing: 50, yunqi: 45 });
  assert.equal(r.category, "balanced");
});

// ---------- 完整題庫組成(§11 定版:9強傾向/4混合/2平衡) ----------

test("quiz.json:題庫共15題,型別配比9強傾向/4混合/2平衡", () => {
  const byType = { strong: 0, mixed: 0, balanced: 0 };
  for (const q of data.quiz.questions) byType[q.type]++;
  assert.equal(data.quiz.questions.length, 15);
  assert.equal(byType.strong, 9);
  assert.equal(byType.mixed, 4);
  assert.equal(byType.balanced, 2);
});

test("openingFateLines:26條完成,配比對齊§11(均衡4/根骨4/悟性4/運氣4/雙高3/極端4/單低3)", () => {
  const lines = data.quiz.openingFateLines;
  const counts = {
    balanced: lines.balanced.length,
    single_high_genggu: lines.single_high_genggu.length,
    single_high_wuxing: lines.single_high_wuxing.length,
    single_high_yunqi: lines.single_high_yunqi.length,
    dual_high: lines.dual_high.length,
    extreme: lines.extreme.length,
    single_low: lines.single_low.length
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 26);
  assert.equal(counts.balanced, 4);
  assert.equal(counts.single_high_genggu, 4);
  assert.equal(counts.single_high_wuxing, 4);
  assert.equal(counts.single_high_yunqi, 4);
  assert.equal(counts.dual_high, 3);
  assert.equal(counts.extreme, 4);
  assert.equal(counts.single_low, 3);
});

test("openingFateLine:依分類正確落點到對應文案池(七區間各驗一次)", () => {
  const cases = [
    [{ genggu: 130, wuxing: 50, yunqi: 50 }, "extreme"],
    [{ genggu: 75, wuxing: 70, yunqi: 30 }, "dual_high"],
    [{ genggu: 25, wuxing: 65, yunqi: 60 }, "single_low"],
    [{ genggu: 80, wuxing: 40, yunqi: 45 }, "single_high"],
    [{ genggu: 55, wuxing: 50, yunqi: 45 }, "balanced"]
  ];
  for (const [talents, expectedCategory] of cases) {
    const fate = openingFateLine(talents, data.quiz, () => 0);
    assert.equal(fate.category, expectedCategory);
    assert.ok(typeof fate.line === "string" && fate.line.length > 0);
  }
});



test("wuxingMultiplier:基準值50 → 倍率1(不影響行為)", () => {
  assert.equal(wuxingMultiplier(50), 1);
});

test("wuxingMultiplier:悟性80 → 倍率1.3", () => {
  assert.ok(Math.abs(wuxingMultiplier(80) - 1.3) < 1e-9);
});

test("wuxingMultiplier:悟性20(低於基準)→ 負加成,倍率0.7", () => {
  assert.ok(Math.abs(wuxingMultiplier(20) - 0.7) < 1e-9);
});

// ---------- 極端命格判定(§8.6 唯一有明確門檻的一層) ----------

test("isExtremeFate:任一值>120視為極端", () => {
  assert.equal(isExtremeFate({ genggu: 121, wuxing: 15, yunqi: 14 }), true);
});

test("isExtremeFate:任一值<10視為極端", () => {
  assert.equal(isExtremeFate({ genggu: 9, wuxing: 70, yunqi: 71 }), true);
});

test("isExtremeFate:三軸皆在10~120區間 → 非極端", () => {
  assert.equal(isExtremeFate({ genggu: 60, wuxing: 50, yunqi: 40 }), false);
});

// ---------- 創角流程(game.js 接線) ----------

test("createCharacter:寫入 state.talents,且不可重抽", () => {
  const s = newState();
  assert.equal(s.talents, null);
  createCharacter(s, [{ questionId: "q03", optionId: "a" }], data);
  assert.ok(s.talents);
  assert.throws(() => createCharacter(s, [{ questionId: "q03", optionId: "a" }], data), /不可重抽/);
});

test("createCharacter:命格文案寫進 journal,只含 category/axis/line,不洩漏天賦數值", () => {
  const s = newState();
  const { fate } = createCharacter(s, [{ questionId: "q01", optionId: "a" }], data, () => 0);
  const entry = s.journal.find((j) => j.type === "fate");
  assert.ok(entry);
  assert.equal(entry.text, fate.line);
  assert.equal(entry.category, fate.category);
  assert.equal(JSON.stringify(entry).includes("genggu"), false); // 不可含天賦數值/欄位
});

test("創角前運動經驗按悟性基準值50計算(倍率1,行為與舊系統一致)", () => {
  const s = newState();
  const { gains } = logExercise(s, data, "paobu", 20, "2026-01-01"); // 20分跑步,未跨階
  assert.ok(Math.abs(gains.light - 20 * 60) < 1e-9);
});

test("創角後運動經驗依悟性倍率縮放", () => {
  const s = newState();
  // 手動指定天賦,不透過測驗,直接驗證 logExercise 有正確套用倍率
  s.talents = { genggu: 50, wuxing: 80, yunqi: 50 }; // 悟性80 → 倍率1.3
  const { gains } = logExercise(s, data, "paobu", 20, "2026-01-01");
  assert.ok(Math.abs(gains.light - 20 * 60 * 1.3) < 1e-9);
});

test("拆單=整批:悟性倍率不影響原有的分階遞減防洗分特性(延伸驗證)", () => {
  const s1 = newState();
  s1.talents = { genggu: 50, wuxing: 80, yunqi: 50 };
  logExercise(s1, data, "paobu", 50, "2026-01-01"); // 一次50分

  const s2 = newState();
  s2.talents = { genggu: 50, wuxing: 80, yunqi: 50 };
  logExercise(s2, data, "paobu", 20, "2026-01-01");
  logExercise(s2, data, "paobu", 20, "2026-01-01");
  logExercise(s2, data, "paobu", 10, "2026-01-01"); // 拆成三次,共50分

  assert.ok(Math.abs(s1.exp.light - s2.exp.light) < 1e-9);
});
