// 事件引擎 v2 測試:察覺判定、際遇判定、樓梯鏈、巢狀抉擇、三段形態、勞務折銀、
// fameVariants、冷卻、資料自檢(《事件庫生產規格書》第八節自檢清單的可自動化部分)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  newState, addSteps, startNextEvent, chooseOption, chooseSub,
  presentEvent, logExercise, createCharacter, resourceMax, useItem
} from "../src/engine/game.js";
import {
  perceptionCheck, eligibleEvents, eventById, optionSuccessRate,
  laborSettlement, TAG_TO_DIM, sixdimLevels
} from "../src/engine/events2.js";
import { thresholdForLevel } from "../src/engine/exp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const data = {
  exercises: loadJson("data/exercises.json"),
  events: loadJson("data/events.json"),
  titles: loadJson("data/titles.json"),
  items: loadJson("data/items.json"),
  tags: loadJson("data/tags.json"),
  quiz: loadJson("data/quiz.json"),
  npcs: loadJson("data/npcs.json"),
  reputation: loadJson("data/reputation.json"),
  whispers: loadJson("data/whispers.json"),
  narratives: loadJson("data/narratives.json")
};

/** 已創角的測試狀態需先走完序章三部曲;此處直接標記為已看過 */
function skipIntro(s) {
  for (const id of data.events.config.intro.sequence) {
    s.journal.push({ n: 0, id, date: "2026-08-01" });
  }
}

const D0 = "2026-08-19", D1 = "2026-08-20", D2 = "2026-08-21", D3 = "2026-08-22";

/** 直接把某維度設到指定等級 */
function setLevel(state, dim, level) {
  state.exp[dim] = thresholdForLevel(level);
}

/** 造一個可強制抽中指定事件的 rng(權重均一時按池內位置) */
function rngFor(state, eventId, todayStr) {
  const candidates = eligibleEvents(state, data, todayStr);
  const idx = candidates.findIndex((c) => c.ev.eventId === eventId);
  assert.ok(idx >= 0, `${eventId} 不在可抽池中`);
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  return () => (idx + 0.5) / total;
}

// ---------- 察覺判定(§9.11.1) ----------

test("察覺:必見(≥2倍)、必盲(<一半)、中間擲骰", () => {
  const ev = eventById(data, "DA-003_rain_shelter"); // 眼功,隱蔽度12
  const s = newState();

  setLevel(s, "eye", 24); // 24 ≥ 12×2 → 必見不擲
  assert.equal(perceptionCheck(s, data, ev, () => 0.999).seen, true);

  setLevel(s, "eye", 5); // 5 < 6 → 必盲不擲
  assert.equal(perceptionCheck(s, data, ev, () => 0.001).seen, false);

  setLevel(s, "eye", 12); // 中間:50%+(12-12)×3%=50%
  assert.equal(perceptionCheck(s, data, ev, () => 0.49).seen, true);
  assert.equal(perceptionCheck(s, data, ev, () => 0.51).seen, false);
});

test("輾壓級察覺:門檻確定性,且必須先看見", () => {
  const ev = eventById(data, "DA-003_rain_shelter"); // crush 門檻 眼24
  const s = newState();
  setLevel(s, "eye", 24);
  const p = perceptionCheck(s, data, ev);
  assert.ok(p.seen && p.crush);
  setLevel(s, "eye", 23);
  assert.equal(perceptionCheck(s, data, ev).crush, false);
});

test("察覺解鎖選項:未察覺者看不到 requirePerception 選項", () => {
  const s = newState();
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "DU-001_arm_wrestle_dock", D0)); // 眼0 → 必盲
  const view = presentEvent(s, data);
  assert.deepEqual(view.choices.map((c) => c.id), ["A", "B"]); // C 藏起來
  assert.equal(view.revealText, undefined);
});

test("gateEvent:察覺失敗整件降級為平淡版,無選項無後果", () => {
  const s = newState();
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "CH-001_cheat_scale", D0)); // 眼0 → 必盲 → 平淡版
  const view = presentEvent(s, data);
  assert.ok(view.immediate);
  assert.match(view.qi, /這鎮子還不錯/);
  const res = chooseOption(s, data, null, D0);
  assert.ok(res.done);
  assert.equal(s.reputation.fame, 0);
  assert.equal(Object.keys(s.flags).length, 0);
});

// ---------- 際遇判定(§9.11.1③) ----------

test("際遇判定只看運氣:高運氣封頂95%、低運氣觸底5%", () => {
  const s = newState();
  const ev = eventById(data, "1-1_lost_purse");
  const optA = ev.beats.cheng.choices.find((c) => c.id === "A");
  s.talents = { genggu: 15, wuxing: 15, yunqi: 120 };
  assert.equal(optionSuccessRate(s, data, ev, optA), 0.95);
  s.talents = { genggu: 95, wuxing: 50, yunqi: 5 };
  assert.equal(optionSuccessRate(s, data, ev, optA), 0.05);
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  assert.equal(optionSuccessRate(s, data, ev, optA), 0.5);
});

// ---------- 樓梯鏈(§9.11.2:一階一階自己走下去) ----------

test("錢袋樓梯:吞錢 → 3天後尋物告示才開門(minDaysSince)", () => {
  const s = newState();
  addSteps(s, 10000);
  startNextEvent(s, data, D0, rngFor(s, "1-1_lost_purse", D0));
  const res = chooseOption(s, data, "B", D0); // 吞了
  assert.ok(res.done);
  assert.ok(s.flags.purse_pocketed);
  assert.equal(s.flagDates.purse_pocketed, D0);

  // 3天內:1-2 不在池中;第3天:開門
  assert.ok(!eligibleEvents(s, data, D1).some((c) => c.ev.eventId === "1-2_purse_notice"));
  assert.ok(eligibleEvents(s, data, D3).some((c) => c.ev.eventId === "1-2_purse_notice"));
});

test("巢狀抉擇:等到天黑(A判定失敗)→ 第二層選擇,等過才拿走軟樓梯", () => {
  const s = newState();
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 }; // 際遇50%
  skipIntro(s);
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "1-1_lost_purse", D0));
  const res = chooseOption(s, data, "A", D0, () => 0.9); // 0.9 > 0.5 → 沒等到
  assert.equal(res.done, false);
  assert.ok(res.sub);
  const view = presentEvent(s, data);
  assert.equal(view.phase, "sub");
  assert.deepEqual(view.choices.map((c) => c.id), ["A2", "B2", "C2"]);
  const final = chooseSub(s, data, "C2", D0);
  assert.ok(final.done);
  assert.ok(s.flags.purse_pocketed_after_wait);
  assert.match(final.entry.resultText, /還是不太像真的/);
});

test("1-2 帶愧疚變體的起段(flag 變體)與察覺加聽段", () => {
  const s = newState();
  s.flags.purse_pocketed_after_wait = true;
  s.flagDates = { purse_pocketed_after_wait: D0 };
  // 讓 1-1 的 minDaysSince 用 journal 查:補一筆 1-1 紀錄
  s.journal.push({ n: 1, id: "1-1_lost_purse", date: D0 });
  s.steps = { total: 9000, resolved: 1, byDate: {} };
  startNextEvent(s, data, D3, rngFor(s, "1-2_purse_notice", D3));
  const view = presentEvent(s, data);
  assert.match(view.qi, /你真的等過/); // flag 變體命中
});

// ---------- 勞務折銀(§9.11.4) ----------

function startEarningBack(s) {
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  skipIntro(s);
  s.flags.purse_pocketed = true;
  s.flagDates = { purse_pocketed: "2026-08-10" };
  s.journal.push({ n: 1, id: "1-1_lost_purse", date: "2026-08-10" });
  s.steps = { total: 20000, resolved: 1, byDate: {} };
  startNextEvent(s, data, D0, rngFor(s, "1-2_purse_notice", D0));
  const res = chooseOption(s, data, "E", D0); // 湊。把它湊回來。
  assert.ok(res.done);
  assert.ok(s.labor?.active);
  assert.ok(s.flags.purse_earning_back);
}

test("勞務折銀:三天天天滿日 → 趕上(結局一)", () => {
  const s = newState();
  startEarningBack(s);
  for (const d of [D1, D2, D3]) {
    logExercise(s, data, "paobu", 30, d); // 有效44分? 30分→有效27.75分×(60+60)=3330 ≥ 1500 → 滿日
  }
  assert.equal(laborSettlement(s, data, D3), "intime");
  const ev = startNextEvent(s, data, D3);
  assert.equal(ev.laborOutcome, "intime");
  const res = chooseOption(s, data, null, D3);
  assert.ok(res.done);
  assert.ok(s.flags.purse_repaid_intime);
  assert.ok(!s.flags.purse_earning_back);
  assert.equal(s.labor, null);
  assert.match(res.entry.resultText, /好人/);
});

test("勞務折銀:漏日補滿 → 遲了(結局二),碼頭做工的孩子", () => {
  const s = newState();
  startEarningBack(s);
  for (const d of [D1, D2, "2026-08-25"]) {
    logExercise(s, data, "paobu", 30, d);
  }
  assert.equal(laborSettlement(s, data, "2026-08-25"), "late");
  startNextEvent(s, data, "2026-08-25");
  chooseOption(s, data, null, "2026-08-25");
  assert.ok(s.flags.purse_repaid_late);
  assert.ok(s.flags.boy_working_dock);
});

test("勞務折銀:連續七天不動 → 放棄(結局三)→ 3天後碼頭少年最後一扇門", () => {
  const s = newState();
  startEarningBack(s);
  assert.equal(laborSettlement(s, data, "2026-08-25"), null); // 第6天還不算
  assert.equal(laborSettlement(s, data, "2026-08-26"), "abandoned");
  startNextEvent(s, data, "2026-08-26");
  chooseOption(s, data, null, "2026-08-26");
  assert.ok(s.flags.purse_ignored);
  assert.ok(!s.flags.purse_earning_back);

  // 樓梯三階:3天後 1-4 開門
  assert.ok(!eligibleEvents(s, data, "2026-08-27").some((c) => c.ev.eventId === "1-4_dock_boy"));
  assert.ok(eligibleEvents(s, data, "2026-08-29").some((c) => c.ev.eventId === "1-4_dock_boy"));

  // 直面少年,說實話:三個 boy flag + 共用收尾段
  startNextEvent(s, data, "2026-08-29", rngFor(s, "1-4_dock_boy", "2026-08-29"));
  const r1 = chooseOption(s, data, "A", "2026-08-29");
  assert.equal(r1.done, false);
  const final = chooseSub(s, data, "A2", "2026-08-29");
  assert.ok(s.flags.boy_saved_mother && s.flags.boy_knows_truth && s.flags.boy_will_seek_you);
  assert.match(final.entry.resultText, /了結不掉的事/); // sharedEpilogue 接上
});

test("1-4 B線繞道失效:mergeInto 併回 A 的直面流程", () => {
  const s = newState();
  s.flags.purse_ignored = true;
  s.flagDates = { purse_ignored: D0 };
  setLevel(s, "eye", 24); // 必見 → B 可見
  s.steps = { total: 9000, resolved: 0, byDate: {} };
  startNextEvent(s, data, "2026-08-29", rngFor(s, "1-4_dock_boy", "2026-08-29"));
  const res = chooseOption(s, data, "B", "2026-08-29");
  assert.equal(res.done, false); // 先生把你指回碼頭 → 進入 A 的 subChoices
  const view = presentEvent(s, data);
  assert.match(view.subPrefixText, /太晚了/);
  assert.match(view.subPrefixText, /我不認得你/);
  chooseSub(s, data, "A1", "2026-08-29");
  assert.ok(s.flags.boy_saved_mother);
});

// ---------- 三段形態(§6.5) ----------

test("輾壓態:相關等級≥基準2倍 → 跳過判定播輾壓文案", () => {
  const s = newState();
  setLevel(s, "hard", 12); // DU-001 benchmark 6 → 比值2
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "DU-001_arm_wrestle_dock", D0));
  assert.equal(s.pendingEvent.form, "crush");
  const view = presentEvent(s, data);
  assert.ok(view.immediate);
  assert.match(view.qi, /門墩/);
  const res = chooseOption(s, data, null, D0);
  assert.ok(res.done);
  assert.equal(res.entry.rate, null); // 沒有判定
  assert.equal(s.reputation.fame, 1);
});

test("仰望態:等級不足基準一半 → 險境文案,判定照跑", () => {
  const s = newState();
  setLevel(s, "light", 2); // DU-002 benchmark 12,比值 2/12 < 0.5;眼0 → E 不可見
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "DU-002_wandering_staff", D0));
  assert.equal(s.pendingEvent.form, "awe");
  const view = presentEvent(s, data);
  assert.match(view.qi, /怕了可以走/);
  const res = chooseOption(s, data, "A", D0, () => 0.999); // 必失敗
  assert.ok(res.done);
  assert.equal(res.entry.success, false);
  assert.match(res.entry.resultText, /江湖等得起/); // awe 版失敗文案
});

// ---------- 聲望反應與效果 ----------

test("fameVariants:譽滿一方以上,見死不救有人看見(偽君子引信)", () => {
  const s = newState();
  setLevel(s, "eye", 24); // CH-001 察覺必見
  s.reputation.fame = data.reputation.tierThresholds.fame[3]; // fameTier 3
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "CH-001_cheat_scale", D0));
  const res = chooseOption(s, data, "C", D0);
  assert.ok(s.flags.scale_lied_as_hero);
  assert.match(res.entry.resultText, /看錯了吧/);
});

test("判定失敗扣資源(絕對值檔位),事件不發六維經驗", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q01", optionId: "a" }], data);
  skipIntro(s);
  const expBefore = { ...s.exp };
  const maxHp = resourceMax(s).hp;
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "DU-001_arm_wrestle_dock", D0));
  const res = chooseOption(s, data, "A", D0, () => 0.999); // 必失敗
  assert.equal(res.entry.success, false);
  assert.equal(s.resources.hp, maxHp - 150); // 輕檔傷害
  assert.deepEqual(s.exp, expBefore);        // 鐵律:事件不得發放六維經驗
});

// ---------- 冷卻 ----------

test("冷卻:同事件在 cooldown 事件數內不再出現", () => {
  const s = newState();
  addSteps(s, 20000);
  startNextEvent(s, data, D0, rngFor(s, "DA-001_teahouse_storyteller", D0));
  chooseOption(s, data, "B", D0);
  assert.ok(!eligibleEvents(s, data, D0).some((c) => c.ev.eventId === "DA-001_teahouse_storyteller"));
  s.steps.resolved += 8; // 模擬又走了8個事件
  assert.ok(eligibleEvents(s, data, D0).some((c) => c.ev.eventId === "DA-001_teahouse_storyteller"));
  s.steps.resolved -= 8;
});

// ---------- 資料自檢(生產規格書第八節,可自動化部分) ----------

test("自檢:標籤都在字典、判定配置合規、effects 欄位合法", () => {
  const legalEffects = new Set(["fame", "infamy", "hpDamage", "mpDamage", "tiliDamage", "hpRestore", "mpRestore", "tiliRestore", "itemGrant", "setFlags", "clearFlags", "flagData"]);
  const collectOutcomes = (node, out = []) => {
    if (!node || typeof node !== "object") return out;
    if (node.effects) out.push(node);
    for (const v of Object.values(node)) collectOutcomes(v, out);
    return out;
  };
  for (const ev of data.events.pool) {
    for (const tag of ev.tagBlock.ability) {
      assert.ok(data.tags.tagRegistry[tag], `${ev.eventId} 用了未知標籤 ${tag}`);
    }
    if (ev.eventType === "duel" || ev.eventType === "fortune") {
      assert.equal(typeof ev.benchmarkLevel, "number", `${ev.eventId} 缺 benchmarkLevel`);
    }
    for (const c of ev.beats.cheng.choices || []) {
      if (c.requirePerception || c.requireCrush) {
        assert.ok(ev.perception, `${ev.eventId} 選項 ${c.id} 需要察覺但事件無 perception`);
      }
      if (c.requireCrush) assert.ok(ev.perception.crushReveal, `${ev.eventId} 選項 ${c.id} 需輾壓級但無 crushReveal`);
      if (c.judge && !c.judgeType) {
        assert.ok((c.tags || []).length > 0, `${ev.eventId} 選項 ${c.id} 出手判定缺 tags`);
        for (const t of c.tags) assert.ok(TAG_TO_DIM[t], `${ev.eventId} 選項 ${c.id} 判定 tag ${t} 非六維`);
      }
    }
    for (const node of collectOutcomes(ev.beats.he)) {
      for (const key of Object.keys(node.effects)) {
        assert.ok(legalEffects.has(key), `${ev.eventId} 有非法 effects 欄位 ${key}`);
      }
    }
    // 對決必寫 crush 變體(規格書第四節;教學事件豁免——一次性且基準極低)
    if (ev.eventType === "duel" && !ev.tagBlock.event.includes("教學")) {
      assert.ok(ev.variants?.crush, `${ev.eventId} 是對決但沒寫 crush 變體`);
    }
  }
});

test("自檢:正式庫 14 + 序章教學 7 + B2~B7 全數入庫,編號一致", () => {
  const ids = data.events.pool.map((e) => e.eventId);
  const expected = [
    "TU-000_setting_out", "TU-001_leaving_village", "TU-002_forked_road",
    "TU-003_bridge_dog", "TU-004_peddler_pouch", "TU-005_temple_night", "TU-006_notice_board",
    "1-1_lost_purse", "1-2_purse_notice", "1-3_purse_earned", "1-4_dock_boy",
    "DA-001_teahouse_storyteller", "DA-002_sugar_figurine", "DA-003_rain_shelter", "DA-004_herb_gatherer",
    "CH-001_cheat_scale", "CH-002_street_duel",
    "DU-001_arm_wrestle_dock", "DU-002_wandering_staff",
    "FO-001_cliff_herb", "FO-002_night_flute",
    "DA-005_teatime_gossip", "DA-006_woodsman_night", "DA-007_tightrope_walker",
    "CH-003_drunkard_stall", "CH-004_overloaded_ferry", "CH-005_landslide",
    "DU-003_river_diving", "DU-004_hunter_archery",
    "FO-003_mist_lantern", "FO-004_night_fishfire",
    "DA-008_ferry_repaid", "CH-006_ferry_grudge", "DA-009_old_tune",
    "CH-007_wine_errand", "DA-010_dock_talk",
    "DA-011_blacksmith", "CH-008_lost_child", "DU-005_teahouse_go",
    "DA-012_rain_pavilion", "DU-006_runaway_mule", "FO-005_sea_of_clouds",
    "CH-009_letter_writing", "FO-006_sunken_bell", "CH-010_peddler_cart", "DA-013_censor_passing",
    "DA-014_night_cart", "DA-015_bow_returned", "FO-007_go_regret", "CH-011_seventh_fair",
    "DA-016_beneath_board", "CH-012_shrine_night", "DU-007_ring_toss", "DU-008_laundry_chase",
    "CH-013_blind_woman", "FO-008_eave_bells",
    "DA-017_old_courier", "DA-018_night_traveler", "DA-019_kids_kungfu",
    "CH-014_faked_injury", "CH-015_porter_back", "CH-016_dice_stall",
    "DU-009_footrace", "DU-010_chicken_chase", "FO-009_broken_stele", "FO-010_shooting_star",
    "CH-017_east_village", "CH-018_south_bridge", "CH-019_boy_returns", "FO-011_coin_keeper",
    "DU-011_challenge_seeker", "CH-020_water_dispute", "CH-021_impostor", "CH-022_storyteller_you",
    "CH-023_kneeling_boy", "CH-024_name_escort"
  ];
  for (const id of expected) assert.ok(ids.includes(id), `缺 ${id}`);
  assert.equal(ids.length, expected.length);
});

// ---------- B2 批次:回聲與路向 ----------

test("DA-005 茶餘飯後:依秦大嫂線 flag 播對應版本(L1 回聲)", () => {
  const mk = (flags) => {
    const s = newState();
    for (const f of flags) { s.flags[f] = true; }
    s.flagDates = Object.fromEntries(flags.map((f) => [f, "2026-08-10"]));
    s.journal.push({ n: 1, id: "1-1_lost_purse", date: "2026-08-10" });
    s.steps = { total: 9000, resolved: 1, byDate: {} };
    return s;
  };

  // 認錯版
  const s1 = mk(["purse_confessed"]);
  startNextEvent(s1, data, D0, rngFor(s1, "DA-005_teatime_gossip", D0));
  const r1 = chooseOption(s1, data, null, D0);
  assert.match(r1.entry.resultText, /肯回頭認帳/);

  // 吞錢未還 → default 版(罵的人就坐在這裡)
  const s2 = mk(["purse_pocketed"]);
  startNextEvent(s2, data, D0, rngFor(s2, "DA-005_teatime_gossip", D0));
  const r2 = chooseOption(s2, data, null, D0);
  assert.match(r2.entry.resultText, /就坐在這裡/);

  // 沒有任何秦大嫂線 flag → 事件根本不出現
  const s3 = newState();
  s3.steps = { total: 9000, resolved: 0, byDate: {} };
  assert.ok(!eligibleEvents(s3, data, D0).some((c) => c.ev.eventId === "DA-005_teatime_gossip"));
});

test("B2 路向加權:選了走山路,山線事件權重提高", () => {
  const s = newState();
  s.flags.road_mountain = true;
  s.steps = { total: 9000, resolved: 0, byDate: {} };
  const candidates = eligibleEvents(s, data, D0);
  const mountain = candidates.find((c) => c.ev.eventId === "DU-004_hunter_archery");
  const town = candidates.find((c) => c.ev.eventId === "CH-003_drunkard_stall");
  assert.equal(mountain.weight, 3); // 1 + road_mountain 2
  assert.equal(town.weight, 1);     // road_town 未持有
});

test("FO-001 仰望版:低輕功玩家拿到險境文案,失敗懲罰加重", () => {
  const s = newState();
  s.flags.herb_rhyme_heard = true;
  s.flagDates = { herb_rhyme_heard: D0 };
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  skipIntro(s);
  setLevel(s, "light", 2); // 2/12 < 0.5 → 仰望
  s.steps = { total: 9000, resolved: 0, byDate: {} };
  const max = { hp: 999999, qi: 999999, tili: 999999 };
  s.resources = { ...max };
  startNextEvent(s, data, D0, rngFor(s, "FO-001_cliff_herb", D0));
  assert.equal(s.pendingEvent.form, "awe");
  const view = presentEvent(s, data);
  assert.match(view.qi, /閻王的帳/);
  const res = chooseOption(s, data, "A", D0, () => 0.999); // 必失敗
  assert.match(res.entry.resultText, /配不上它/);
  assert.equal(s.resources.hp, 999999 - 1200); // 仰望失敗:重傷檔
});

// ---------- 序章三部曲 + 教學(M7 內容灌裝) ----------

test("序章:創角後前三個事件槽固定順序,命格分歧正確落點", () => {
  const s = newState();
  s.talents = { genggu: 132, wuxing: 9, yunqi: 9 }; // 極端根骨命格
  addSteps(s, 5000);

  const ev1 = startNextEvent(s, data, D0, () => 0.5);
  assert.equal(ev1.id, "TU-000_setting_out");
  const r1 = chooseOption(s, data, null, D0);
  assert.ok(r1.done);
  assert.match(r1.entry.resultText, /給右肩也曬曬太陽/); // 高根骨轉段
  assert.match(r1.entry.resultText, /沒人聽過的名字/);   // 共用合段

  const ev2 = startNextEvent(s, data, D0, () => 0.5);
  assert.equal(ev2.id, "TU-001_leaving_village");
  chooseOption(s, data, null, D0);
  assert.ok(s.flags.heard_sitianjian);

  const ev3 = startNextEvent(s, data, D0, () => 0.5);
  assert.equal(ev3.id, "TU-002_forked_road");
  chooseOption(s, data, "C", D0);
  assert.ok(s.flags.road_mountain);

  // 第四個事件槽起開放隨機池
  const ev4 = startNextEvent(s, data, D0, () => 0.99);
  assert.notEqual(ev4.id, "TU-000_setting_out");
});

test("序00:均衡命格走 default 轉段", () => {
  const s = newState();
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  addSteps(s, 1000);
  startNextEvent(s, data, D0, () => 0.5);
  const { entry } = chooseOption(s, data, null, D0);
  assert.match(entry.resultText, /就是走/);
});

test("教學04:物品發放與使用(金創藥恢復血量、酸梅恢復體力)", () => {
  const s = newState();
  createCharacter(s, [{ questionId: "q01", optionId: "a" }], data);
  skipIntro(s);
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "TU-004_peddler_pouch", D0));
  chooseOption(s, data, "B", D0);
  assert.equal(s.inventory.jinchuangyao, 1);
  assert.equal(s.inventory.suanmei, 1);

  s.resources.hp -= 500;
  s.resources.tili -= 150;
  const r1 = useItem(s, data, "jinchuangyao");
  assert.equal(r1.restore.hp, 400);
  const r2 = useItem(s, data, "suanmei");
  assert.equal(r2.restore.tili, 100);
  assert.equal(s.inventory.jinchuangyao, undefined);
});

test("教學06:榜文模板變數填入群俠錄第一名", () => {
  const s = newState();
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "TU-006_notice_board", D0));
  const { entry } = chooseOption(s, data, null, D0);
  assert.match(entry.resultText, /沈聽雪/);
  assert.doesNotMatch(entry.resultText, /\{輕功譜/);
});

// ---------- 天賦耳語(§8.6) ----------

test("耳語:23 句全數入庫,極端命格才觸發、序章豁免、冷卻生效", () => {
  const total = Object.values(data.whispers.pools).reduce((a, p) => a + p.length, 0);
  assert.equal(total, 23);

  const s = newState();
  s.talents = { genggu: 132, wuxing: 9, yunqi: 9 };
  s.steps = { total: 90000, resolved: 10, byDate: {} };
  skipIntro(s);

  // rng:抽事件用大值,耳語機率擲 0(必中)
  let calls = 0;
  const rng = () => { calls++; return calls <= 1 ? 0.99 : 0.0001; };
  startNextEvent(s, data, D0, rng);
  assert.ok(s.pendingEvent.whisper, "極端命格+機率命中應注入耳語");
  assert.ok(s.whisperSeen);
  const firstWhisperN = s.lastWhisperN;
  chooseOption(s, data, presentEvent(s, data).choices[0]?.id ?? null, D0, () => 0.5);

  // 冷卻 5 事件內不再注入
  let calls2 = 0;
  const rng2 = () => { calls2++; return calls2 <= 1 ? 0.99 : 0.0001; };
  startNextEvent(s, data, D0, rng2);
  assert.equal(s.pendingEvent.whisper, undefined);
  assert.equal(s.lastWhisperN, firstWhisperN);

  // 普通命格永不觸發
  const s2 = newState();
  s2.talents = { genggu: 60, wuxing: 50, yunqi: 40 };
  s2.steps = { total: 9000, resolved: 0, byDate: {} };
  skipIntro(s2);
  let calls3 = 0;
  const rng3 = () => { calls3++; return calls3 <= 1 ? 0.99 : 0.0001; };
  startNextEvent(s2, data, D0, rng3);
  assert.equal(s2.pendingEvent.whisper, undefined);
});

// ---------- 敘事池資料完整性 ----------

test("narratives.json:6 種狀態敘事四段俱全、頒號六維各一段", () => {
  const st = data.narratives.states;
  assert.deepEqual(Object.keys(st).sort(), ["hp_heavy", "hp_light", "qi_heavy", "qi_light", "tili_heavy", "tili_light"]);
  for (const [key, v] of Object.entries(st)) {
    for (const beat of ["jue", "cha", "xing", "bian"]) {
      assert.ok(v[beat]?.length > 10, `${key} 缺 ${beat} 段`);
    }
  }
  const tb = data.narratives.titleBestow;
  assert.deepEqual(Object.keys(tb).sort(), ["ear", "eye", "hard", "inner", "light", "soft"]);
  const expectedTitles = { light: "掠影追風", inner: "氣貫長虹", hard: "鐵骨錚錚", soft: "綿裡藏針", eye: "明察秋毫", ear: "耳聽八方" };
  for (const [dim, v] of Object.entries(tb)) {
    assert.equal(v.title, expectedTitles[dim]);
    for (const beat of ["qi", "cheng", "zhuan", "he"]) {
      assert.ok(v[beat]?.length > 10, `${dim} 頒號缺 ${beat} 段`);
    }
  }
});

test("FO-001 需要順口溜鑰匙;FO-002 空穗環需另過眼功察覺", () => {
  const s = newState();
  addSteps(s, 5000);
  // 沒聽過順口溜 → FO-001 不在池中
  assert.ok(!eligibleEvents(s, data, D0).some((c) => c.ev.eventId === "FO-001_cliff_herb"));
  s.flags.herb_rhyme_heard = true;
  assert.ok(eligibleEvents(s, data, D0).some((c) => c.ev.eventId === "FO-001_cliff_herb"));

  // FO-002:耳功高到必見與循聲必成,但眼功0 → 看不見空穗環
  setLevel(s, "ear", 40);
  startNextEvent(s, data, D0, rngFor(s, "FO-002_night_flute", D0));
  const res = chooseOption(s, data, "A", D0, () => 0.01); // 必成功
  assert.ok(s.flags.flute_source_seen);
  assert.ok(!s.flags.empty_tassel_seen);
  assert.doesNotMatch(res.entry.resultText, /穗環/);
});

// ---------- B3 批次:後續回聲與出名版 ----------

test("B3:byFlag 事件的出名版本生效(舊調重彈・跟燈版)", () => {
  const mk = (fame) => {
    const s = newState();
    s.flags.lantern_tune = true;
    s.flagDates = { lantern_tune: "2026-08-10" };
    s.journal.push({ n: 1, id: "FO-003_mist_lantern", date: "2026-08-10" });
    s.steps = { total: 9000, resolved: 1, byDate: {} };
    s.reputation.fame = fame;
    return s;
  };
  // 無名之輩:琴師把話說完
  const s1 = mk(0);
  startNextEvent(s1, data, D0, rngFor(s1, "DA-009_old_tune", D0));
  const r1 = chooseOption(s1, data, null, D0);
  assert.match(r1.entry.resultText, /聽過的人……都不在了/);
  assert.ok(s1.flags.fiddler_knows_tune);
  // 名人:琴師把話嚥了回去
  const s2 = mk(data.reputation.tierThresholds.fame[4]);
  startNextEvent(s2, data, D0, rngFor(s2, "DA-009_old_tune", D0));
  const r2 = chooseOption(s2, data, null, D0);
  assert.match(r2.entry.resultText, /嚥了回去/);
  assert.ok(s2.flags.fiddler_fled_from_name);
});

test("B3:渡口冷臉 C 提醒龍骨 → 樑子一筆勾銷還倒欠一次", () => {
  const s = newState();
  s.flags.ferryman_grudge = true;
  s.flagDates = { ferryman_grudge: "2026-08-10" };
  s.journal.push({ n: 1, id: "CH-004_overloaded_ferry", date: "2026-08-10" });
  s.steps = { total: 9000, resolved: 1, byDate: {} };
  setLevel(s, "ear", 24); // 察覺必見
  startNextEvent(s, data, D0, rngFor(s, "CH-006_ferry_grudge", D0));
  const res = chooseOption(s, data, "C", D0);
  assert.ok(res.done);
  assert.ok(s.flags.ferryman_owes_you);
  assert.ok(!s.flags.ferryman_grudge);
});

// ---------- B4 批次:名次得知管道 ----------

test("B4:監使過境=監使管道、茶棚棋局(城鎮)=榜文管道、山巔雲海=不揭名次", async () => {
  const { revealsRanking } = await import("../src/engine/npcs.js");
  const by = (id) => data.events.pool.find((e) => e.eventId === id).tagBlock;
  assert.equal(revealsRanking(by("DA-013_censor_passing")), "監使");
  assert.equal(revealsRanking(by("DU-005_teahouse_go")), "榜文");
  assert.equal(revealsRanking(by("FO-005_sea_of_clouds")), null);
});

test("B4:貨郎拋錨——察覺者有省力解,未察覺者只能硬推", () => {
  const s = newState();
  addSteps(s, 1000);
  startNextEvent(s, data, D0, rngFor(s, "CH-010_peddler_cart", D0)); // 眼0 → 必盲
  assert.deepEqual(presentEvent(s, data).choices.map((c) => c.id), ["A", "C"]);

  const s2 = newState();
  setLevel(s2, "eye", 24);
  addSteps(s2, 1000);
  startNextEvent(s2, data, D0, rngFor(s2, "CH-010_peddler_cart", D0));
  assert.deepEqual(presentEvent(s2, data).choices.map((c) => c.id), ["A", "B", "C"]);
  const res = chooseOption(s2, data, "B", D0);
  assert.match(res.entry.resultText, /它認方向/);
  assert.equal(s2.reputation.fame, 1);
});

// ---------- B7 批次:俠名門檻與伏筆三響 ----------

test("B7:出名者專屬事件——俠名不到抽不到,俠名遠播(第4階)入池", () => {
  const s = newState();
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  skipIntro(s);
  addSteps(s, 1000);
  const gated = [
    "DU-011_challenge_seeker", "CH-020_water_dispute", "CH-021_impostor",
    "CH-022_storyteller_you", "CH-023_kneeling_boy", "CH-024_name_escort"
  ];
  let ids = eligibleEvents(s, data, D0).map((c) => c.ev.eventId);
  for (const id of gated) assert.ok(!ids.includes(id), `${id} 不該出現在無名之輩的池中`);

  s.reputation.fame = data.reputation.tierThresholds.fame[4]; // 俠名遠播
  ids = eligibleEvents(s, data, D0).map((c) => c.ev.eventId);
  for (const id of gated) assert.ok(ids.includes(id), `${id} 該出現在俠名遠播的池中`);
});

test("B7:劍線三響——兩響旗標齊+隔3天才開門", () => {
  const s = newState();
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  skipIntro(s);
  addSteps(s, 1000);
  const has = (d) => eligibleEvents(s, data, d).some((c) => c.ev.eventId === "CH-017_east_village");
  assert.ok(!has(D3), "沒看過劍坯與騾車不該開門");
  s.flags.smith_swords_seen = true;
  s.flags.sword_cart_seen = true;
  s.journal.push({ n: 1, id: "DA-014_night_cart", date: D0 });
  assert.ok(!has(D1), "隔天太早");
  assert.ok(has(D3), "第3天該開門");
});

test("B7:少年尋你——boy_will_seek_you 滿10天開門,察覺者能認出沒開刃", () => {
  const s = newState();
  s.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  skipIntro(s);
  addSteps(s, 1000);
  s.flags.boy_will_seek_you = true;
  s.flagDates = { boy_will_seek_you: "2026-08-01" };
  assert.ok(eligibleEvents(s, data, D0).some((c) => c.ev.eventId === "CH-019_boy_returns"));

  // 東邊的村子:眼功高看破沒開刃 → C 解鎖
  const s2 = newState();
  s2.talents = { genggu: 50, wuxing: 50, yunqi: 50 };
  skipIntro(s2);
  setLevel(s2, "eye", 24);
  addSteps(s2, 1000);
  s2.flags.smith_swords_seen = true;
  s2.flags.sword_cart_seen = true;
  s2.journal.push({ n: 1, id: "DA-014_night_cart", date: "2026-08-10" });
  startNextEvent(s2, data, D0, rngFor(s2, "CH-017_east_village", D0));
  assert.deepEqual(presentEvent(s2, data).choices.map((c) => c.id), ["A", "B", "C"]);
  const res = chooseOption(s2, data, "C", D0);
  assert.ok(res.done);
  assert.ok(s2.flags.blunt_swords_known);
});
